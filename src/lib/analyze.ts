import type { Analysis, AppMeta, Opportunity, Review, Theme } from "./types";
import type { RawOpportunity, RawTheme, ThemeForScoring } from "./llm";

export type Engine = {
  model: string;
  clusterThemes(appTitle: string, reviews: Review[]): Promise<{ summary: string; themes: RawTheme[] }>;
  scoreOpportunities(appTitle: string, themes: ThemeForScoring[]): Promise<{ opportunities: RawOpportunity[] }>;
};

export const MIN_WORDS = 4;
const IMPACTS = [0.25, 0.5, 1, 2, 3];
const CONFIDENCES = [0.5, 0.8, 1];

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const nearest = (n: number, allowed: number[]) =>
  allowed.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Reviews short enough to carry no signal ("good", "worst app") are counted but not clustered. */
export function substantive(reviews: Review[]) {
  return reviews.filter((r) => r.text.split(/\s+/).filter(Boolean).length >= MIN_WORDS);
}

export async function runAnalysis(
  app: AppMeta,
  allReviews: Review[],
  engine: Engine,
  onStage: (stage: "clustering" | "scoring", message: string) => void
): Promise<Analysis> {
  // Short, stable IDs keep the prompt small and make hallucinated IDs easy to reject.
  const reviews = substantive(allReviews).map((r, i) => ({ ...r, id: `r${i + 1}` }));
  if (reviews.length < 10) {
    throw new Error(
      `Only ${reviews.length} reviews had enough text to analyse. Try an app with more reviews, or upload a larger CSV.`
    );
  }
  const byId = new Map(reviews.map((r) => [r.id, r]));

  // Rating histogram and averages over everything fetched.
  const ratingHistogram = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const r of allReviews) {
    if (r.rating && r.rating >= 1 && r.rating <= 5) ratingHistogram[String(Math.round(r.rating)) as "1"]++;
  }
  const avgRating = mean(allReviews.map((r) => r.rating).filter((x): x is number => !!x));

  // Trend split: median date of dated reviews -> "recent half" vs "earlier half".
  const dated = reviews.filter((r) => r.date).map((r) => new Date(r.date!).getTime()).sort((a, b) => a - b);
  const dateRange = dated.length
    ? { from: new Date(dated[0]).toISOString(), to: new Date(dated[dated.length - 1]).toISOString() }
    : null;
  const canTrend = dated.length >= 40 && dated[dated.length - 1] - dated[0] > 2 * 86400000;
  const splitTs = canTrend ? dated[Math.floor(dated.length / 2)] : null;
  const recentIds = new Set<string>();
  const earlierIds = new Set<string>();
  if (splitTs !== null) {
    for (const r of reviews) {
      if (!r.date) continue;
      (new Date(r.date).getTime() >= splitTs ? recentIds : earlierIds).add(r.id);
    }
  }

  onStage("clustering", `Grouping ${reviews.length} reviews into themes`);
  const clustered = await engine.clusterThemes(app.title, reviews);

  const themes: Theme[] = [];
  clustered.themes.forEach((t, i) => {
    const ids = [...new Set(t.review_ids)].filter((id) => byId.has(id));
    if (ids.length < 2) return;
    const ratings = ids.map((id) => byId.get(id)!.rating).filter((x): x is number => !!x);
    // Prefer the model's picks, then fill from the theme; skip duplicate texts (copy-paste reviews are common).
    const seenText = new Set<string>();
    const quoteIds = [...new Set([...(t.quote_ids || []).filter((id) => ids.includes(id)), ...ids])]
      .filter((id) => {
        const key = byId.get(id)!.text.toLowerCase().replace(/\W+/g, "");
        if (seenText.has(key)) return false;
        seenText.add(key);
        return true;
      })
      .slice(0, 3);
    let trend: Theme["trend"] = null;
    if (splitTs !== null && recentIds.size && earlierIds.size) {
      const recentShare = ids.filter((id) => recentIds.has(id)).length / recentIds.size;
      const earlierShare = ids.filter((id) => earlierIds.has(id)).length / earlierIds.size;
      trend = { recentShare, earlierShare, delta: recentShare - earlierShare };
    }
    themes.push({
      id: `t${i + 1}`,
      name: t.name,
      description: t.description,
      type: t.type,
      sentiment: t.sentiment,
      reviewIds: ids,
      count: ids.length,
      share: ids.length / reviews.length,
      avgRating: ratings.length ? round(mean(ratings)!, 2) : null,
      trend,
      quotes: quoteIds.map((id) => {
        const r = byId.get(id)!;
        return { id, text: r.text, rating: r.rating };
      }),
    });
  });
  themes.sort((a, b) => b.count - a.count);
  if (!themes.length) throw new Error("No clear themes came out of these reviews. Try more reviews.");

  const assigned = new Set(themes.flatMap((t) => t.reviewIds));

  onStage("scoring", `Scoring opportunities across ${themes.length} themes`);
  const actionable = themes.filter((t) => t.type !== "praise");
  const forScoring: ThemeForScoring[] = themes.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    type: t.type,
    sentiment: t.sentiment,
    count: t.count,
    sharePct: round(t.share * 100),
    avgRating: t.avgRating,
    trendDeltaPct: t.trend ? round(t.trend.delta * 100) : null,
    sampleQuotes: t.quotes.map((q) => q.text.slice(0, 280)),
  }));

  let opportunities: Opportunity[] = [];
  if (actionable.length) {
    const scored = await engine.scoreOpportunities(app.title, forScoring);
    const themeById = new Map(themes.map((t) => [t.id, t]));
    opportunities = scored.opportunities
      .map((o, i) => {
        const linked = [...new Set(o.theme_ids)].filter((id) => themeById.get(id) && themeById.get(id)!.type !== "praise");
        if (!linked.length) return null;
        // Reach = unique reviewers touched by the linked themes, as % of analysed reviews.
        const touched = new Set(linked.flatMap((id) => themeById.get(id)!.reviewIds));
        const reach = round((touched.size / reviews.length) * 100);
        const impact = nearest(o.impact, IMPACTS);
        const confidence = nearest(o.confidence, CONFIDENCES);
        const effort = Math.min(16, Math.max(0.5, o.effort || 1));
        return {
          id: `o${i + 1}`,
          title: o.title,
          themeIds: linked,
          problem: o.problem,
          proposal: o.proposal,
          successMetric: o.success_metric,
          impact,
          impactWhy: o.impact_why,
          confidence,
          confidenceWhy: o.confidence_why,
          effort,
          effortWhy: o.effort_why,
          reach,
          rice: round((reach * impact * confidence) / effort),
        } satisfies Opportunity;
      })
      .filter((o): o is Opportunity => o !== null)
      .sort((a, b) => b.rice - a.rice);
  }

  return {
    app,
    reviewCount: allReviews.length,
    analysedCount: reviews.length,
    avgRating: avgRating !== null ? round(avgRating, 2) : null,
    ratingHistogram,
    dateRange,
    trendSplit: splitTs !== null ? new Date(splitTs).toISOString() : null,
    summary: clustered.summary,
    themes,
    opportunities,
    unassignedCount: reviews.length - assigned.size,
    model: engine.model,
    generatedAt: new Date().toISOString(),
  };
}
