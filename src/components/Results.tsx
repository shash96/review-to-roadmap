"use client";

import { useState } from "react";
import type { Analysis, Opportunity, Sentiment, Theme } from "@/lib/types";
import { toMarkdown } from "@/lib/markdown";

const SENTIMENT: Record<Sentiment, { label: string; color: string }> = {
  negative: { label: "Negative", color: "var(--color-neg)" },
  mixed: { label: "Mixed", color: "var(--color-mixed)" },
  positive: { label: "Positive", color: "var(--color-pos)" },
};

const TYPE_LABEL: Record<Theme["type"], string> = {
  bug: "Bug",
  performance: "Performance",
  ux: "Usability",
  feature_request: "Feature request",
  pricing: "Pricing",
  support: "Support",
  trust_safety: "Trust and safety",
  praise: "Praise",
  other: "Other",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function Quote({ text, rating }: { text: string; rating: number | null }) {
  const short = text.length > 240 ? text.slice(0, 237).trimEnd() + "…" : text;
  return (
    <blockquote className="quote highlight-in font-serif italic text-[1.075rem] leading-[1.6] text-ink">
      <mark>{short}</mark>
      {rating ? <span className="not-italic font-sans text-sm text-muted ml-2 whitespace-nowrap">{rating}★</span> : null}
    </blockquote>
  );
}

function RatingBars({ h }: { h: Analysis["ratingHistogram"] }) {
  const max = Math.max(1, ...Object.values(h));
  return (
    <div className="flex items-end gap-1.5 h-10" aria-label="Rating distribution">
      {(["1", "2", "3", "4", "5"] as const).map((k) => (
        <div key={k} className="flex flex-col items-center gap-1">
          <div
            className="w-5 rounded-sm bg-ink/80"
            style={{ height: `${Math.max(2, (h[k] / max) * 28)}px` }}
            title={`${k}★: ${h[k]} reviews`}
          />
          <span className="text-[11px] text-muted leading-none">{k}★</span>
        </div>
      ))}
    </div>
  );
}

function Trend({ t, sentiment }: { t: Theme["trend"]; sentiment: Sentiment }) {
  if (!t) return <span className="text-muted">No trend data</span>;
  const pts = Math.round(t.delta * 100);
  if (Math.abs(pts) < 2) return <span className="text-muted">Steady</span>;
  const worsening = sentiment !== "positive" ? pts > 0 : pts < 0;
  return (
    <span style={{ color: worsening ? "var(--color-neg)" : "var(--color-pos)" }} className="font-medium">
      {pts > 0 ? "▲" : "▼"} {Math.abs(pts)} pts recently
    </span>
  );
}

function OpportunityRow({ o, rank, themes }: { o: Opportunity; rank: number; themes: Map<string, Theme> }) {
  const [open, setOpen] = useState(rank === 1);
  const linked = o.themeIds.map((id) => themes.get(id)!).filter(Boolean);
  const quotes = linked
    .flatMap((t) => t.quotes)
    .filter((q, i, arr) => arr.findIndex((x) => x.text === q.text) === i)
    .slice(0, 2);
  return (
    <li className="border-t border-rule">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full text-left grid grid-cols-[2.25rem_1fr_auto] gap-x-4 items-baseline py-5 group cursor-pointer"
      >
        <span className="text-2xl font-semibold text-muted tabular-nums">{rank}</span>
        <span>
          <span className="block text-xl font-semibold tracking-tight group-hover:underline underline-offset-4 decoration-1">
            {o.title}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span>Reach {o.reach}%</span>
            <span>Impact {o.impact}</span>
            <span>Confidence {Math.round(o.confidence * 100)}%</span>
            <span>Effort {o.effort} wks</span>
          </span>
        </span>
        <span className="text-right">
          <span className="block text-3xl font-semibold tabular-nums tracking-tight">{o.rice}</span>
          <span className="block text-xs text-muted">RICE score</span>
        </span>
      </button>
      {open && (
        <div className="pl-[3.25rem] pb-7 grid gap-6 md:grid-cols-[1fr_1fr] md:gap-10">
          <div className="space-y-4 text-[0.975rem] leading-relaxed max-w-prose">
            <p><span className="font-semibold">Problem.</span> {o.problem}</p>
            <p><span className="font-semibold">Proposal.</span> {o.proposal}</p>
            <p><span className="font-semibold">Measure it by.</span> {o.successMetric}</p>
            <dl className="text-sm text-muted space-y-1.5 pt-1">
              <div><dt className="inline font-medium text-ink">Impact {o.impact}: </dt><dd className="inline">{o.impactWhy}</dd></div>
              <div><dt className="inline font-medium text-ink">Confidence {Math.round(o.confidence * 100)}%: </dt><dd className="inline">{o.confidenceWhy}</dd></div>
              <div><dt className="inline font-medium text-ink">Effort {o.effort} wks: </dt><dd className="inline">{o.effortWhy}</dd></div>
            </dl>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Based on {linked.map((t) => t.name).join(", ")}
            </p>
            {quotes.map((q) => <Quote key={q.id} text={q.text} rating={q.rating} />)}
          </div>
        </div>
      )}
    </li>
  );
}

function ThemeRow({ t, maxShare }: { t: Theme; maxShare: number }) {
  const [open, setOpen] = useState(false);
  const s = SENTIMENT[t.sentiment];
  return (
    <li className="border-t border-rule">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full text-left grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_9rem] gap-x-6 gap-y-2 items-center py-4 cursor-pointer group"
      >
        <span>
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-full shrink-0" style={{ background: s.color }} aria-label={s.label} />
            <span className="font-semibold group-hover:underline underline-offset-4 decoration-1">{t.name}</span>
          </span>
          <span className="block text-sm text-muted mt-0.5 pl-[1.125rem]">
            {TYPE_LABEL[t.type]}{t.avgRating ? `, average ${t.avgRating}★` : ""}
          </span>
        </span>
        <span className="flex items-center gap-3 pl-[1.125rem] md:pl-0">
          <span className="h-2 flex-1 bg-rule rounded-full overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${(t.share / maxShare) * 100}%`, background: s.color }} />
          </span>
          <span className="text-sm tabular-nums w-24 text-right">
            {t.count} reviews <span className="text-muted">{Math.round(t.share * 100)}%</span>
          </span>
        </span>
        <span className="text-sm pl-[1.125rem] md:pl-0 md:text-right">
          <Trend t={t.trend} sentiment={t.sentiment} />
        </span>
      </button>
      {open && (
        <div className="pl-[1.125rem] pb-6 space-y-4 max-w-3xl">
          <p className="text-[0.975rem] leading-relaxed">{t.description}</p>
          {t.quotes.map((q) => <Quote key={q.id} text={q.text} rating={q.rating} />)}
        </div>
      )}
    </li>
  );
}

export default function Results({ a, onReset }: { a: Analysis; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const themes = new Map(a.themes.map((t) => [t.id, t]));
  const maxShare = Math.max(...a.themes.map((t) => t.share));

  async function copy() {
    try {
      await navigator.clipboard.writeText(toMarkdown(a));
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const blob = new Blob([toMarkdown(a)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(a.app.appId || a.app.title).replace(/[^\w.-]+/g, "-")}-roadmap.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-14">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          {a.app.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.app.icon} alt="" className="size-14 rounded-2xl border border-rule" />
          ) : null}
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">{a.app.title}</h2>
            <p className="text-muted mt-1">
              {a.analysedCount} of the latest {a.reviewCount} reviews analysed
              {a.dateRange ? `, ${fmtDate(a.dateRange.from)} to ${fmtDate(a.dateRange.to)}` : ""}
              {a.app.storeRating ? `. Store rating ${a.app.storeRating.toFixed(1)}★` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-end gap-6">
          <div className="text-right">
            <div className="text-3xl font-semibold tabular-nums">{a.avgRating ?? "–"}★</div>
            <div className="text-xs text-muted">average in this sample</div>
          </div>
          <RatingBars h={a.ratingHistogram} />
        </div>
      </header>

      <p className="text-2xl leading-[1.45] tracking-tight max-w-[44rem] text-ink">{a.summary}</p>

      <section aria-labelledby="opps">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
          <h3 id="opps" className="text-lg font-semibold">What to fix or build next</h3>
          <p className="text-sm text-muted">Ranked by RICE: reach × impact × confidence ÷ effort</p>
        </div>
        {a.opportunities.length ? (
          <ol className="border-b border-rule">
            {a.opportunities.map((o, i) => (
              <OpportunityRow key={o.id} o={o} rank={i + 1} themes={themes} />
            ))}
          </ol>
        ) : (
          <p className="text-muted border-t border-rule pt-4">These reviews are mostly praise, so there&apos;s nothing to fix yet.</p>
        )}
      </section>

      <section aria-labelledby="themes">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
          <h3 id="themes" className="text-lg font-semibold">What users are talking about</h3>
          <p className="text-sm text-muted">
            {a.trendSplit ? `Trend compares reviews since ${fmtDate(a.trendSplit)} with the ones before` : "Open a theme to read the reviews behind it"}
          </p>
        </div>
        <ul className="border-b border-rule">
          {a.themes.map((t) => <ThemeRow key={t.id} t={t} maxShare={maxShare} />)}
        </ul>
        {a.unassignedCount > 0 && (
          <p className="text-sm text-muted mt-3">{a.unassignedCount} reviews didn&apos;t fit a clear theme.</p>
        )}
      </section>

      <footer className="flex flex-wrap items-center gap-3 pt-2">
        <button onClick={copy} className="rounded-full bg-ink text-paper px-5 py-2.5 font-medium hover:bg-ink/90 cursor-pointer">
          {copied ? "Copied" : "Copy as markdown"}
        </button>
        {process.env.NEXT_PUBLIC_DEMO !== "1" && (
          <button onClick={download} className="rounded-full border border-ink px-5 py-2.5 font-medium hover:bg-card cursor-pointer">
            Download .md
          </button>
        )}
        <button onClick={onReset} className="px-3 py-2.5 font-medium underline underline-offset-4 cursor-pointer">
          Analyse another app
        </button>
        <p className="basis-full text-sm text-muted mt-3 max-w-prose">
          Reach, shares and trends are calculated from the reviews. Impact, confidence and effort are AI estimates made from outside the company. Treat them as a starting point for discussion.
        </p>
      </footer>
    </div>
  );
}
