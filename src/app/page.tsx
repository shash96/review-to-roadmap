"use client";

import { useRef, useState } from "react";
import Results from "@/components/Results";
import { parseReviewsCsv } from "@/lib/csv";
import type { Analysis, StreamEvent } from "@/lib/types";
import { runAnalysis } from "@/lib/analyze";
import { mockEngine, mockReviews } from "@/lib/mock";

// Demo build (NEXT_PUBLIC_DEMO=1): runs entirely in the browser on fictional sample reviews.
const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

const SAMPLES = [
  { name: "Zomato", id: "com.application.zomato" },
  { name: "Swiggy", id: "in.swiggy.android" },
  { name: "Blinkit", id: "com.grofers.customerapp" },
  { name: "CRED", id: "com.dreamplug.androidapp" },
];

const STAGES = [
  { key: "fetching", label: "Fetch reviews" },
  { key: "clustering", label: "Group into themes" },
  { key: "scoring", label: "Score opportunities" },
] as const;

type Stage = (typeof STAGES)[number]["key"];

export default function Home() {
  const [app, setApp] = useState("");
  const [count, setCount] = useState(300);
  const [stage, setStage] = useState<Stage | null>(null);
  const [stageMsg, setStageMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = stage !== null;

  async function runDemo() {
    setError(null);
    setResult(null);
    setStage("fetching");
    setStageMsg("Fetching the latest 300 reviews");
    try {
      await new Promise((r) => setTimeout(r, 900));
      const { app: meta, reviews } = mockReviews(300);
      const analysis = await runAnalysis(meta, reviews, mockEngine, (st, msg) => {
        setStage(st);
        setStageMsg(msg);
      });
      setResult(analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStage(null);
    }
  }

  async function run(body: unknown, firstStage: Stage) {
    setError(null);
    setResult(null);
    setStage(firstStage);
    setStageMsg(firstStage === "fetching" ? "Fetching reviews" : "Reading your file");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `The request failed (${res.status}). Try again.`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        buf += decoder.decode(chunk.value || new Uint8Array(), { stream: !done });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as StreamEvent;
          if (e.type === "stage") {
            setStage(e.stage);
            setStageMsg(e.message);
          } else if (e.type === "result") {
            setResult(e.analysis);
          } else if (e.type === "error") {
            throw new Error(e.message);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setStage(null);
    }
  }

  function analyse(input = app) {
    if (DEMO) {
      runDemo();
      return;
    }
    if (!input.trim()) {
      setError("Paste a Play Store link or app ID first.");
      return;
    }
    setApp(input);
    run({ source: "play_store", app: input, count }, "fetching");
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      const rows = await parseReviewsCsv(f);
      if (rows.length < 10) throw new Error(`The file has ${rows.length} reviews. Upload at least 10.`);
      run({ source: "csv", title: f.name.replace(/\.csv$/i, ""), reviews: rows.slice(0, 500) }, "clustering");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const reset = () => {
    setResult(null);
    setError(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <main className="mx-auto max-w-[68rem] px-5 sm:px-8 pt-10 pb-24">
      <nav className="flex items-center justify-between text-sm mb-16 sm:mb-24">
        <button onClick={reset} className="font-semibold tracking-tight text-base cursor-pointer">
          Review-to-Roadmap
        </button>
        {process.env.NEXT_PUBLIC_REPO_URL ? (
          <a href={process.env.NEXT_PUBLIC_REPO_URL} className="text-muted hover:text-ink underline-offset-4 hover:underline">
            How it&apos;s built
          </a>
        ) : null}
      </nav>

      {!result && (
        <section>
          <h1 className="text-[clamp(2.4rem,6vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.035em] max-w-[16ch]">
            Your users already wrote your roadmap.
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted max-w-[38rem] leading-relaxed">
            Paste any Play Store app. Get the themes behind its reviews, what&apos;s getting worse, and a RICE-ranked list of what to fix or build next.
          </p>

          <form
            className="mt-10 sm:mt-12"
            onSubmit={(e) => {
              e.preventDefault();
              analyse();
            }}
          >
            <label htmlFor="app" className="sr-only">Play Store link or app ID</label>
            <div className="flex flex-col sm:flex-row gap-3 bg-card border-2 border-ink rounded-2xl p-2 sm:p-2.5 shadow-[6px_6px_0_var(--color-ink)]">
              <input
                id="app"
                value={app}
                onChange={(e) => setApp(e.target.value)}
                disabled={busy}
                placeholder="play.google.com/store/apps/details?id=…"
                className="flex-1 min-w-0 bg-transparent px-3 py-3 text-lg outline-none placeholder:text-muted/70"
                autoComplete="off"
                spellCheck={false}
              />
              <div className="flex gap-2">
                <label htmlFor="count" className="sr-only">Number of reviews</label>
                <select
                  id="count"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  disabled={busy}
                  className="rounded-xl bg-paper px-3 text-sm font-medium"
                >
                  <option value={100}>100 reviews</option>
                  <option value={300}>300 reviews</option>
                  <option value={500}>500 reviews</option>
                </select>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 sm:flex-none rounded-xl bg-star text-ink font-semibold px-6 py-3 text-lg hover:brightness-95 disabled:opacity-60 cursor-pointer"
                >
                  {busy ? "Analysing" : "Analyse reviews"}
                </button>
              </div>
            </div>
          </form>

          {DEMO ? (
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
              <button
                onClick={runDemo}
                disabled={busy}
                className="rounded-full border border-ink bg-card px-4 py-1.5 font-medium hover:bg-paper disabled:opacity-50 cursor-pointer"
              >
                Run the demo
              </button>
              <span className="text-muted">
                This prototype runs on fictional sample reviews for a made-up food delivery app. The live version fetches real Play Store reviews.
              </span>
            </div>
          ) : (
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted mr-1">Try</span>
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                onClick={() => analyse(s.id)}
                disabled={busy}
                className="rounded-full border border-rule bg-card px-3.5 py-1.5 font-medium hover:border-ink disabled:opacity-50 cursor-pointer"
              >
                {s.name}
              </button>
            ))}
            <span className="text-muted mx-1">or</span>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="font-medium underline underline-offset-4 disabled:opacity-50 cursor-pointer"
            >
              upload a CSV of reviews
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          )}

          {busy && (
            <div className="mt-12" role="status" aria-live="polite">
              <ol className="flex flex-wrap gap-x-8 gap-y-2">
                {STAGES.map((s, i) => {
                  const cur = STAGES.findIndex((x) => x.key === stage);
                  const state = i < cur ? "done" : i === cur ? "now" : "later";
                  return (
                    <li key={s.key} className={`flex items-center gap-2 ${state === "later" ? "text-muted/60" : ""}`}>
                      <span
                        className={`size-2.5 rounded-full ${state === "now" ? "bg-star ring-4 ring-star/30 animate-pulse" : state === "done" ? "bg-ink" : "bg-rule"}`}
                      />
                      <span className={state === "now" ? "font-semibold" : ""}>{s.label}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="text-muted mt-3">{stageMsg}.{DEMO ? "" : " This usually takes 30 to 60 seconds."}</p>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-10 max-w-[40rem] border-l-4 border-neg pl-4 py-1 text-[1.02rem]">
              {error}
            </p>
          )}

          {!busy && !error && (
            <div className="mt-24 grid gap-10 sm:grid-cols-3 border-t border-rule pt-10 text-[0.975rem] leading-relaxed">
              <div>
                <h2 className="font-semibold mb-1.5">Numbers you can check</h2>
                <p className="text-muted">Reach, theme share and trends are counted from the reviews, not guessed by the AI.</p>
              </div>
              <div>
                <h2 className="font-semibold mb-1.5">Every theme has receipts</h2>
                <p className="text-muted">Open any theme or opportunity to read the real reviews behind it.</p>
              </div>
              <div>
                <h2 className="font-semibold mb-1.5">Ready for your PRD</h2>
                <p className="text-muted">Copy the whole analysis as markdown into Notion, Docs or a ticket.</p>
              </div>
            </div>
          )}
        </section>
      )}

      {result && <Results a={result} onReset={reset} />}
    </main>
  );
}
