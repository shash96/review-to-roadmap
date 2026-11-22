import { z } from "zod";
import { runAnalysis, type Engine } from "@/lib/analyze";
import { clusterThemes, scoreOpportunities, MODEL } from "@/lib/llm";
import { fetchPlayStore, parseAppId } from "@/lib/playstore";
import { mockEngine, mockReviews } from "@/lib/mock";
import { getCached, rateLimit, setCached } from "@/lib/guard";
import type { AppMeta, Review, StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_REVIEWS = 500;
const MOCK = process.env.MOCK_MODE === "1";

const realEngine: Engine = { model: MODEL, clusterThemes, scoreOpportunities };

const Body = z.union([
  z.object({
    source: z.literal("play_store"),
    app: z.string().min(1).max(300),
    count: z.number().int().min(50).max(MAX_REVIEWS).default(300),
  }),
  z.object({
    source: z.literal("csv"),
    title: z.string().min(1).max(120),
    reviews: z
      .array(
        z.object({
          text: z.string().max(4000),
          rating: z.number().min(1).max(5).nullable(),
          date: z.string().nullable(),
        })
      )
      .min(10)
      .max(MAX_REVIEWS),
  }),
]);

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return Response.json({ error: "The request was malformed. Check the app link or CSV and try again." }, { status: 400 });
  }

  let appId: string | null = null;
  if (body.source === "play_store") {
    appId = parseAppId(body.app);
    if (!appId) {
      return Response.json(
        { error: "That doesn't look like a Play Store link or app ID. Paste a link like play.google.com/store/apps/details?id=com.example.app" },
        { status: 400 }
      );
    }
  }

  const cacheKey = body.source === "play_store" ? `ps:${appId}:${body.count}` : null;
  const cached = cacheKey ? getCached(cacheKey) : null;

  if (!cached) {
    const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
    const limit = rateLimit(ip);
    if (!limit.ok) {
      return Response.json(
        { error: `You've hit the limit of free analyses for this hour. Try again in ${limit.retryMins} minutes.` },
        { status: 429 }
      );
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        if (cached) {
          send({ type: "result", analysis: cached, cached: true });
          return;
        }
        let app: AppMeta;
        let reviews: Review[];
        if (body.source === "play_store") {
          send({ type: "stage", stage: "fetching", message: `Fetching the latest ${body.count} reviews` });
          if (MOCK) ({ app, reviews } = mockReviews(body.count));
          else {
            try {
              ({ app, reviews } = await fetchPlayStore(appId!, body.count));
            } catch (e) {
              const msg = e instanceof Error ? e.message : "";
              throw new Error(
                msg.startsWith("No Play Store app")
                  ? msg
                  : "Couldn't fetch reviews from the Play Store right now. Try again in a minute, or upload a CSV of reviews instead."
              );
            }
          }
          if (!reviews.length) throw new Error("This app has no written reviews in the India store yet.");
        } else {
          app = { appId: null, title: body.title, source: "csv" };
          reviews = body.reviews.map((r, i) => ({
            id: `c${i}`,
            text: r.text.trim(),
            rating: r.rating,
            date: r.date && !isNaN(Date.parse(r.date)) ? new Date(r.date).toISOString() : null,
          }));
        }

        const analysis = await runAnalysis(app, reviews, MOCK ? mockEngine : realEngine, (stage, message) =>
          send({ type: "stage", stage, message })
        );
        if (cacheKey) setCached(cacheKey, analysis);
        send({ type: "result", analysis });
      } catch (e) {
        console.error(e);
        let message = e instanceof Error ? e.message : "Something went wrong.";
        if (/rate_limit|overloaded|529|429|RESOURCE_EXHAUSTED|quota/i.test(message))
          message = "The free AI quota is used up for now. Try again in a few minutes, or tomorrow if the daily limit was hit.";
        if (/authentication|api key|API_KEY_INVALID|401|403/i.test(message) && !/_API_KEY set/.test(message))
          message = "The server's AI API key was rejected. Check the key in your environment variables.";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
