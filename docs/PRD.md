# Review-to-Roadmap — PRD (v1)

**Owner:** Shashwat · **Status:** v1 shipped · **Built with:** Claude (API + Claude Code), Next.js, Vercel

## 1. Problem
Every consumer app gets thousands of Play Store reviews a month. They're the cheapest, most honest user signal a PM has — and almost nobody reads them systematically. PMs skim the latest 20, screenshot an angry one for a deck, and move on. The result: recurring pain points go unprioritised, and roadmap debates run on anecdotes.

Existing tools (AppFollow, Appbot, etc.) solve monitoring for support/ASO teams. They tag and count; they don't answer the PM question: **"What should we build or fix next, and why?"**

## 2. Users
- **Primary:** Product managers at consumer apps who want a fast, evidence-backed read of user pain before planning.
- **Secondary:** PM candidates preparing for interviews ("here's what your users are saying"), founders doing competitive research.

## 3. Job to be done
> "When I'm planning the next cycle, help me turn raw reviews into a short, ranked list of opportunities I can defend in a roadmap review."

## 4. v1 scope
| In | Out (later) |
|---|---|
| Any public Play Store app by URL or package ID | App Store, Reddit, Twitter sources |
| Last 100–500 reviews (newest first), India store | Scheduled monitoring / alerts |
| CSV upload fallback (any source) | Accounts, saved workspaces |
| Theme clustering with sentiment, share, avg rating, trend | Competitor side-by-side |
| Ranked opportunities with RICE score + rationale | Jira/Linear export |
| Representative verbatim quotes per theme | Multi-language analysis |
| Markdown export (paste into PRD/Notion) | |

## 5. Key product decisions
1. **LLM for judgment, code for numbers.** Claude clusters reviews and estimates Impact/Confidence/Effort with a written rationale. *Reach*, theme share, average rating and trend are computed deterministically from the tagged reviews — so the numbers are auditable and never hallucinated.
2. **Every theme is traceable.** Each theme links back to the exact reviews that support it. Quotes are pulled from real review text, not generated.
3. **RICE, not a black-box score.** PMs already speak RICE; showing each component (and why) makes the ranking debatable, which is the point.
4. **No login wall.** Anyone — including a hiring manager — can try it on their own app in 30 seconds. Costs are controlled with per-IP rate limits and caching instead.
5. **Trend = last 14 days vs. before.** Surfaces what's getting worse now (a bad release), not just what's always been loud.

## 6. Success metrics
- **North star:** analyses completed per week.
- **Quality:** theme-assignment agreement vs. a hand-labelled set (target ≥ 80%); % of opportunities users mark useful.
- **Engagement:** % of analyses exported to markdown; repeat usage.
- **Guardrails:** p95 analysis time < 60s; cost per analysis < $0.10; error rate < 5%.

## 7. Risks
| Risk | Mitigation |
|---|---|
| Play Store blocks/changes scraping | CSV upload fallback; cache results |
| LLM mislabels or merges themes | Structured output, review-ID traceability, eval set |
| Abuse runs up API bill | Per-IP rate limit, review cap, cache by app |
| Effort estimates are guesses from outside the company | Labelled as estimates with rationale; user can re-rank |

## 8. What's next
Competitor compare mode · App Store source · release-version correlation (did v8.2 cause the spike?) · weekly digest email.
