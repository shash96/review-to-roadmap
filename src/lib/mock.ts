/**
 * Mock mode (MOCK_MODE=1): fictional sample reviews + a keyword-based stand-in for the LLM,
 * so the UI and pipeline can be developed and tested without network or API spend.
 * Never shown as real data: the app title says "Sample app".
 */
import type { AppMeta, Review } from "./types";
import type { Engine } from "./analyze";
import type { RawTheme } from "./llm";

const TEMPLATES: { key: string; rating: number; texts: string[]; recentBias?: number }[] = [
  {
    key: "payment",
    rating: 1,
    recentBias: 0.8,
    texts: [
      "Payment failed three times with UPI but money got debited from my account",
      "UPI payment keeps failing after the latest update, amount deducted but order not placed",
      "Money debited, order not confirmed. Refund still pending after five days",
      "Card payment page just spins and then says payment failed, very frustrating",
    ],
  },
  {
    key: "delivery",
    rating: 2,
    texts: [
      "Delivery takes much longer than the time shown in the app, shown 25 min took 70",
      "ETA keeps increasing after ordering, delivery partner stuck at one place on the map",
      "Food arrives cold because delivery is always late in my area",
    ],
  },
  {
    key: "support",
    rating: 1,
    texts: [
      "Customer support chat is a bot that never connects me to a human",
      "Raised a complaint about a missing item, support closed the ticket without resolution",
      "No way to call customer support, chat bot keeps repeating the same options",
    ],
  },
  {
    key: "fees",
    rating: 2,
    texts: [
      "Platform fee, packaging fee, rain fee, the extra charges make it costlier than the restaurant",
      "Hidden charges added at checkout, the final bill is much higher than menu prices",
    ],
  },
  {
    key: "filters",
    rating: 4,
    texts: [
      "Please add a filter for pure veg restaurants, scrolling through everything is tiring",
      "Would love an option to save favourite dishes and reorder in one tap",
    ],
  },
  {
    key: "praise",
    rating: 5,
    texts: [
      "Great variety of restaurants and the offers are really good on weekends",
      "Smooth app, easy to order and tracking is accurate most of the time",
      "Love the discounts for members, saves me a lot every month",
    ],
  },
];

const THEMES: Record<string, Omit<RawTheme, "review_ids" | "quote_ids">> = {
  payment: { name: "UPI payments fail but money is debited", description: "Payments fail at checkout while the amount is still deducted, and refunds are slow.", type: "bug", sentiment: "negative" },
  delivery: { name: "Delivery ETAs are unreliable", description: "Actual delivery times run well past the ETA shown before ordering.", type: "performance", sentiment: "negative" },
  support: { name: "Can't reach a human in support", description: "Support is a bot loop and tickets close without resolution.", type: "support", sentiment: "negative" },
  fees: { name: "Extra fees feel hidden", description: "Platform and other fees appear late and inflate the final bill.", type: "pricing", sentiment: "negative" },
  filters: { name: "Want veg filter and quick reorder", description: "Users ask for a veg-only filter and one-tap reorder of favourites.", type: "feature_request", sentiment: "mixed" },
  praise: { name: "Offers and variety keep users", description: "Users value restaurant choice and member discounts.", type: "praise", sentiment: "positive" },
};

export function mockReviews(n: number): { app: AppMeta; reviews: Review[] } {
  const now = Date.now();
  const reviews: Review[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const t = TEMPLATES[Math.floor(rand() * TEMPLATES.length)];
    const recent = t.recentBias ? rand() < t.recentBias : rand() < 0.5;
    const daysAgo = recent ? rand() * 14 : 14 + rand() * 16;
    const text = i % 9 === 0 ? "worst app" : t.texts[Math.floor(rand() * t.texts.length)];
    reviews.push({
      id: `m${i}`,
      text,
      rating: Math.min(5, Math.max(1, t.rating + (rand() < 0.2 ? 1 : 0))),
      date: new Date(now - daysAgo * 86400000).toISOString(),
    });
  }
  return { app: { appId: "sample.app", title: "Sample app (demo data)", source: "play_store", storeRating: 3.9, totalRatings: 120000 }, reviews };
}

const KEYWORDS: Record<string, RegExp> = {
  payment: /payment|upi|debited|refund/i,
  delivery: /delivery|eta|late|cold/i,
  support: /support|complaint|ticket|bot/i,
  fees: /fee|charges|bill/i,
  filters: /filter|reorder|favourite/i,
  praise: /great|love|smooth/i,
};

export const mockEngine: Engine = {
  model: "mock",
  async clusterThemes(_title, reviews) {
    await new Promise((r) => setTimeout(r, 800));
    const themes = Object.entries(KEYWORDS).map(([key, re]) => {
      const ids = reviews.filter((r) => re.test(r.text)).map((r) => r.id);
      return { ...THEMES[key], review_ids: ids, quote_ids: ids.slice(0, 3) };
    });
    return {
      summary:
        "Payments are the urgent problem: failed UPI transactions that still debit money have surged in the last two weeks and drag ratings to 1 star. Delivery ETAs and an unreachable support team are the next biggest drivers of low ratings, while offers and restaurant variety are what users value most.",
      themes,
    };
  },
  async scoreOpportunities(_title, themes) {
    await new Promise((r) => setTimeout(r, 600));
    const id = (name: string) => themes.find((t) => t.name === THEMES[name].name)?.id ?? "";
    return {
      opportunities: [
        { title: "Fix failed UPI payments and auto-refund", theme_ids: [id("payment")], problem: "The most-mentioned issue, and it grew in the recent half.", proposal: "Reconcile pending UPI transactions within minutes and auto-refund or auto-confirm the order.", success_metric: "Payment-failure reviews down 50% in 30 days", impact: 3, impact_why: "Money lost is the fastest path to uninstall and 1-star ratings.", confidence: 0.8, confidence_why: "Evidence is consistent; root cause may sit with the payment gateway.", effort: 4, effort_why: "Gateway reconciliation and refund automation across teams." },
        { title: "Show honest delivery ETAs", theme_ids: [id("delivery")], problem: "ETAs routinely miss by a wide margin.", proposal: "Recalibrate ETA model with live rider supply and show a range instead of a point estimate.", success_metric: "ETA miss rate under 15%", impact: 2, impact_why: "Late, cold food drives repeat complaints.", confidence: 0.8, confidence_why: "Clear pattern, but ETA accuracy is a hard ML problem.", effort: 6, effort_why: "Model work plus UI changes." },
        { title: "Add a human escalation in support chat", theme_ids: [id("support")], problem: "Users get stuck in bot loops.", proposal: "Offer a human agent after two failed bot turns for order-value issues.", success_metric: "Support-related reviews down 40%", impact: 2, impact_why: "Unresolved issues turn into public 1-star reviews.", confidence: 1, confidence_why: "Direct, repeated asks.", effort: 2, effort_why: "Routing rule change plus staffing." },
        { title: "Show all fees upfront", theme_ids: [id("fees")], problem: "Fees appear late in checkout.", proposal: "Show the estimated total including fees on the menu and cart.", success_metric: "Checkout drop-off down 5%", impact: 1, impact_why: "Trust issue more than a blocker.", confidence: 0.8, confidence_why: "Fewer mentions but consistent.", effort: 1, effort_why: "Front-end change." },
        { title: "Add veg filter and one-tap reorder", theme_ids: [id("filters")], problem: "Users ask for faster discovery and reorder.", proposal: "Ship a veg-only filter and a reorder shortcut on the home screen.", success_metric: "Repeat orders up 3%", impact: 1, impact_why: "Convenience gain for frequent users.", confidence: 0.8, confidence_why: "Specific feature asks.", effort: 2, effort_why: "Search filter plus a home module." },
      ],
    };
  },
};
