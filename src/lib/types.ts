export type Review = {
  id: string;
  text: string;
  rating: number | null; // 1-5
  date: string | null; // ISO
  version?: string | null;
  thumbsUp?: number;
};

export type AppMeta = {
  appId: string | null;
  title: string;
  icon?: string | null;
  storeRating?: number | null;
  totalRatings?: number | null;
  source: "play_store" | "csv";
};

export type ThemeType =
  | "bug"
  | "performance"
  | "ux"
  | "feature_request"
  | "pricing"
  | "support"
  | "trust_safety"
  | "praise"
  | "other";

export type Sentiment = "negative" | "mixed" | "positive";

export type Theme = {
  id: string;
  name: string;
  description: string;
  type: ThemeType;
  sentiment: Sentiment;
  reviewIds: string[];
  // computed
  count: number;
  share: number; // 0-1 of analysed reviews
  avgRating: number | null;
  trend: { recentShare: number; earlierShare: number; delta: number } | null;
  quotes: { id: string; text: string; rating: number | null }[];
};

export type Opportunity = {
  id: string;
  title: string;
  themeIds: string[];
  problem: string;
  proposal: string;
  successMetric: string;
  impact: number; // 0.25 | 0.5 | 1 | 2 | 3
  impactWhy: string;
  confidence: number; // 0.5 | 0.8 | 1
  confidenceWhy: string;
  effort: number; // person-weeks
  effortWhy: string;
  // computed
  reach: number; // % of analysed reviewers (0-100)
  rice: number;
};

export type Analysis = {
  app: AppMeta;
  reviewCount: number; // fetched
  analysedCount: number; // with enough text to cluster
  avgRating: number | null;
  ratingHistogram: Record<"1" | "2" | "3" | "4" | "5", number>;
  dateRange: { from: string; to: string } | null;
  trendSplit: string | null; // ISO date that splits "recent" vs "earlier"
  summary: string;
  themes: Theme[];
  opportunities: Opportunity[];
  unassignedCount: number;
  model: string;
  generatedAt: string;
};

export type StreamEvent =
  | { type: "stage"; stage: "fetching" | "clustering" | "scoring"; message: string }
  | { type: "result"; analysis: Analysis; cached?: boolean }
  | { type: "error"; message: string };
