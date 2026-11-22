import type { Analysis } from "./types";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function toMarkdown(a: Analysis): string {
  const themeName = new Map(a.themes.map((t) => [t.id, t.name]));
  const lines: string[] = [];
  lines.push(`# ${a.app.title}: review analysis`);
  lines.push("");
  lines.push(
    `${a.analysedCount} reviews analysed (of ${a.reviewCount} fetched)` +
      (a.dateRange ? `, ${a.dateRange.from.slice(0, 10)} to ${a.dateRange.to.slice(0, 10)}` : "") +
      (a.avgRating ? `. Average rating ${a.avgRating}★.` : ".")
  );
  lines.push("");
  lines.push(`## Summary`, "", a.summary, "");
  lines.push(`## Ranked opportunities (RICE)`, "");
  lines.push(`| # | Opportunity | Reach | Impact | Confidence | Effort (wks) | RICE |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  a.opportunities.forEach((o, i) => {
    lines.push(`| ${i + 1} | ${o.title} | ${o.reach}% | ${o.impact} | ${Math.round(o.confidence * 100)}% | ${o.effort} | ${o.rice} |`);
  });
  lines.push("");
  a.opportunities.forEach((o, i) => {
    lines.push(`### ${i + 1}. ${o.title}`);
    lines.push(`- **Problem:** ${o.problem}`);
    lines.push(`- **Proposal:** ${o.proposal}`);
    lines.push(`- **Success metric:** ${o.successMetric}`);
    lines.push(`- **Themes:** ${o.themeIds.map((id) => themeName.get(id)).join(", ")}`);
    lines.push(`- **Impact ${o.impact}:** ${o.impactWhy}`);
    lines.push(`- **Confidence ${Math.round(o.confidence * 100)}%:** ${o.confidenceWhy}`);
    lines.push(`- **Effort ${o.effort} wks:** ${o.effortWhy}`);
    lines.push("");
  });
  lines.push(`## Themes`, "");
  for (const t of a.themes) {
    const trend = t.trend ? `, ${t.trend.delta >= 0 ? "+" : ""}${Math.round(t.trend.delta * 100)} pts recently` : "";
    lines.push(`### ${t.name}`);
    lines.push(`${t.description} (${t.count} reviews, ${pct(t.share)}${t.avgRating ? `, avg ${t.avgRating}★` : ""}${trend})`);
    for (const q of t.quotes) lines.push(`> ${q.text.replace(/\n+/g, " ")}${q.rating ? ` (${q.rating}★)` : ""}`);
    lines.push("");
  }
  lines.push(`---`, `Generated with Review-to-Roadmap. Reach, shares and trends are computed from the reviews; impact, confidence and effort are AI estimates.`);
  return lines.join("\n");
}
