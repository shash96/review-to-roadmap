# Review-to-Roadmap

**Turn Play Store reviews into a RICE-ranked roadmap.** Paste any app's Play Store link and get:

- **Themes** behind the reviews, with sentiment, share of reviews and average rating
- **Trends**: which problems grew in the recent half of the period
- **Real quotes** for every theme, so each claim can be checked
- **Ranked opportunities** scored with RICE, each with a problem, a proposal, a success metric and the reasoning behind every score
- **Markdown export** you can paste into a PRD, Notion or a ticket

Built by Shashwat as a product + AI side project. The product thinking is in [docs/PRD.md](docs/PRD.md).

## How it works

```
Play Store link ──► fetch latest N reviews (google-play-scraper)
                     │   or CSV upload
                     ▼
            filter out reviews too short to carry signal
                     ▼
   LLM call 1: group reviews into 5–10 themes  ──► review IDs per theme
                     ▼
   Code: share, avg rating, trend (recent half vs earlier half), quotes
                     ▼
   LLM call 2: opportunities + Impact / Confidence / Effort with reasons
                     ▼
   Code: Reach = unique reviewers touched ÷ analysed reviews; RICE = R×I×C÷E
```

**The main design choice: the LLM handles judgment, code handles numbers.** Because of this, the model provider can be swapped: prompts and schemas are shared, and Gemini or Claude only fill in a fixed JSON shape.

 The model decides which reviews belong together and estimates impact, confidence and effort, explaining each. Code calculates every count, percentage, trend and the final RICE score from the review IDs the model returns. Unknown IDs are dropped, so the numbers can't be hallucinated and can be traced back to the reviews.

Other choices:
- **Structured output** (JSON schema on Gemini, forced tool use on Claude), so every response parses into a fixed shape
- **Streaming progress** (NDJSON), so users see each stage during a 30–60s analysis
- **No login.** Costs are controlled with a per-IP hourly limit and a 6-hour cache per app

## Stack

Next.js 15 (App Router), TypeScript, Tailwind CSS 4, google-play-scraper, Vercel. AI provider is swappable: Google Gemini (free tier) or Anthropic Claude, chosen with one environment variable. Built with Claude.

## Run locally

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY
npm run dev
```

Set `MOCK_MODE=1` to build the UI without network access or API costs. It runs on fictional sample data.

Set `NEXT_PUBLIC_DEMO=1` to make the page run a demo in the browser on fictional sample reviews. It makes no server calls.

## Deploy to Vercel

1. Push this repo to GitHub.
2. On vercel.com: **Add New → Project**, import the repo, and keep the defaults.
3. Under **Environment Variables**, add `GEMINI_API_KEY` (free from aistudio.google.com → Get API key). Optionally also add `NEXT_PUBLIC_REPO_URL` (your GitHub repo URL, which shows a "How it's built" link) and `RATE_LIMIT_PER_HOUR`.
4. Click **Deploy**.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | none | Google AI Studio key (free tier). If set, Gemini is used |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Any Gemini model on your tier, such as `gemini-3.5-flash-lite` |
| `ANTHROPIC_API_KEY` | none | Claude API key (paid) |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Claude model |
| `AI_PROVIDER` | auto | `gemini` or `anthropic`. Auto picks Gemini if its key is set |
| `RATE_LIMIT_PER_HOUR` | `5` | Analyses per IP per hour (cached results don't count) |
| `CACHE_TTL_HOURS` | `6` | How long a Play Store analysis is reused |
| `NEXT_PUBLIC_REPO_URL` | none | Shows a "How it's built" link in the header |
| `MOCK_MODE` | off | `1` = fake data and no API calls, for development |

## CSV format

You need a column named `text` or `review`. Columns named `rating`/`score`/`stars` and `date` are optional. Up to 500 rows are used.

## Roadmap

- Eval set: 100 hand-labelled reviews to measure how well themes are assigned
- Compare two competing apps side by side
- App Store as a source
- Link spikes in complaints to app releases
