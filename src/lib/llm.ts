import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import type { Review, Sentiment, ThemeType } from "./types";

/**
 * The AI provider is swappable: prompts and schemas are shared, and all scoring maths
 * lives in code, so switching models changes nothing else in the app.
 * AI_PROVIDER=gemini|anthropic. If unset: Gemini when GEMINI_API_KEY is set, else Claude.
 */
export const PROVIDER: "gemini" | "anthropic" =
  process.env.AI_PROVIDER === "anthropic" || process.env.AI_PROVIDER === "gemini"
    ? process.env.AI_PROVIDER
    : process.env.GEMINI_API_KEY
      ? "gemini"
      : "anthropic";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const MODEL = PROVIDER === "gemini" ? GEMINI_MODEL : ANTHROPIC_MODEL;

const THEME_TYPES: ThemeType[] = [
  "bug",
  "performance",
  "ux",
  "feature_request",
  "pricing",
  "support",
  "trust_safety",
  "praise",
  "other",
];

export type RawTheme = {
  name: string;
  description: string;
  type: ThemeType;
  sentiment: Sentiment;
  review_ids: string[];
  quote_ids: string[];
};

export type RawOpportunity = {
  title: string;
  theme_ids: string[];
  problem: string;
  proposal: string;
  success_metric: string;
  impact: number;
  impact_why: string;
  confidence: number;
  confidence_why: string;
  effort: number;
  effort_why: string;
};

export type ThemeForScoring = {
  id: string;
  name: string;
  description: string;
  type: ThemeType;
  sentiment: Sentiment;
  count: number;
  sharePct: number;
  avgRating: number | null;
  trendDeltaPct: number | null;
  sampleQuotes: string[];
};

let client: Anthropic | null = null;
let gemini: GoogleGenAI | null = null;

type StructuredCall = {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens: number;
};

function callTool<T>(opts: StructuredCall): Promise<T> {
  return PROVIDER === "gemini" ? callGemini<T>(opts) : callAnthropic<T>(opts);
}

/** Gemini's JSON-schema support is a subset; numeric enums are dropped (code snaps values to allowed ones anyway). */
function geminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (k === "enum" && obj.type === "number") continue;
      out[k] = geminiSchema(v);
    }
    return out;
  }
  return node;
}

async function callGemini<T>(opts: StructuredCall): Promise<T> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("The server has no GEMINI_API_KEY set. Add it in your environment variables and redeploy.");
  }
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: opts.user,
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseJsonSchema: geminiSchema(opts.schema),
      maxOutputTokens: Math.max(opts.maxTokens, 16000),
      temperature: 0.2,
    },
  });
  const finish = res.candidates?.[0]?.finishReason;
  if (finish === "MAX_TOKENS") {
    throw new Error("The analysis was cut off because it ran too long. Try fewer reviews.");
  }
  const text = res.text;
  if (!text) throw new Error("The model didn't return a result. Try again.");
  try {
    return JSON.parse(text) as T;
  } catch {
    // Occasionally wrapped in a code fence.
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("The model returned a result that couldn't be read. Try again.");
  }
}

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("The server has no ANTHROPIC_API_KEY set. Add it in your environment variables and redeploy.");
  }
  client ??= new Anthropic();
  return client;
}

async function callAnthropic<T>(opts: StructuredCall): Promise<T> {
  const res = await getClient().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens,
    system: opts.system,
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
    messages: [{ role: "user", content: opts.user }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("The model didn't return a structured result. Try again.");
  }
  if (res.stop_reason === "max_tokens") {
    throw new Error("The analysis was cut off because it ran too long. Try fewer reviews.");
  }
  return block.input as T;
}

function formatReview(r: Review) {
  const stars = r.rating ? `${r.rating}★` : "no rating";
  const date = r.date ? r.date.slice(0, 10) : "no date";
  const text = r.text.replace(/\s+/g, " ").slice(0, 500);
  return `[${r.id}] ${stars} | ${date} | ${text}`;
}

export async function clusterThemes(
  appTitle: string,
  reviews: Review[]
): Promise<{ summary: string; themes: RawTheme[] }> {
  const system = `You are a senior product manager's research analyst. You read app-store reviews and group them into themes that a product team can act on.

Rules:
- Produce 5 to 10 themes. Prefer specific, actionable themes ("OTP not arriving at login") over vague buckets ("bad experience").
- A theme must be supported by at least 2 reviews. Each review can belong to at most 2 themes. Reviews with nothing actionable (e.g. "nice", "worst app") can belong to no theme.
- Keep praise in its own themes with type "praise", so the team knows what to protect.
- Name themes in plain language, under 6 words, from the user's point of view.
- review_ids must be the exact bracketed IDs from the input. quote_ids: pick the 2-3 most specific, representative reviews for the theme (subset of review_ids).
- The summary is 2-3 sentences: the overall picture a PM should know first. No hedging, no filler.`;

  const user = `App: ${appTitle}
Number of reviews: ${reviews.length}

Reviews (format: [id] rating | date | text):
${reviews.map(formatReview).join("\n")}`;

  return callTool({
    system,
    user,
    toolName: "report_themes",
    toolDescription: "Report the themes found in the reviews.",
    maxTokens: 16000,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        themes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string", description: "One sentence: what users are experiencing." },
              type: { type: "string", enum: THEME_TYPES },
              sentiment: { type: "string", enum: ["negative", "mixed", "positive"] },
              review_ids: { type: "array", items: { type: "string" } },
              quote_ids: { type: "array", items: { type: "string" } },
            },
            required: ["name", "description", "type", "sentiment", "review_ids", "quote_ids"],
          },
        },
      },
      required: ["summary", "themes"],
    },
  });
}

export async function scoreOpportunities(
  appTitle: string,
  themes: ThemeForScoring[]
): Promise<{ opportunities: RawOpportunity[] }> {
  const system = `You are a senior product manager turning user-research themes into a prioritised list of opportunities, scored with RICE.

Reach is calculated separately from the data, so do not estimate it. You estimate the other three:
- impact: how much solving this moves the user's experience and the business (ratings, retention, conversion). Use exactly one of 3 (massive), 2 (high), 1 (medium), 0.5 (low), 0.25 (minimal).
- confidence: how sure you are that the proposal fixes the problem, given the evidence. Use exactly one of 1 (high: clear, consistent evidence), 0.8 (medium), 0.5 (low: thin or ambiguous evidence).
- effort: person-weeks for a typical product team, between 0.5 and 16. You're outside the company, so reason from what the fix plausibly involves.

Rules:
- Produce 3 to 6 opportunities. One opportunity can address several related themes. Don't create opportunities from praise themes, but you may cite a praise theme as something to protect in the rationale.
- Titles are short and start with a verb ("Fix OTP delivery on login").
- problem: 1-2 sentences grounded in the theme data (cite numbers you were given).
- proposal: 1-2 sentences, concrete enough to start a PRD.
- success_metric: one measurable metric with a direction.
- Each *_why is one sentence.
- theme_ids must be the exact IDs given.`;

  const user = `App: ${appTitle}

Themes (sharePct = % of analysed reviews mentioning the theme; trendDeltaPct = change in share between the earlier and recent half of the period, in percentage points):
${JSON.stringify(themes, null, 2)}`;

  return callTool({
    system,
    user,
    toolName: "report_opportunities",
    toolDescription: "Report prioritised opportunities with RICE components.",
    maxTokens: 6000,
    schema: {
      type: "object",
      properties: {
        opportunities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              theme_ids: { type: "array", items: { type: "string" } },
              problem: { type: "string" },
              proposal: { type: "string" },
              success_metric: { type: "string" },
              impact: { type: "number", enum: [0.25, 0.5, 1, 2, 3] },
              impact_why: { type: "string" },
              confidence: { type: "number", enum: [0.5, 0.8, 1] },
              confidence_why: { type: "string" },
              effort: { type: "number" },
              effort_why: { type: "string" },
            },
            required: [
              "title",
              "theme_ids",
              "problem",
              "proposal",
              "success_metric",
              "impact",
              "impact_why",
              "confidence",
              "confidence_why",
              "effort",
              "effort_why",
            ],
          },
        },
      },
      required: ["opportunities"],
    },
  });
}
