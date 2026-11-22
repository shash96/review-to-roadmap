import Papa from "papaparse";

export type CsvReview = { text: string; rating: number | null; date: string | null };

const TEXT_COLS = ["text", "review", "content", "body", "comment", "review text", "review_text"];
const RATING_COLS = ["rating", "score", "stars", "star rating", "star_rating"];
const DATE_COLS = ["date", "at", "created_at", "review date", "review_date", "timestamp", "time"];

function pick(headers: string[], options: string[]) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const o of options) {
    const i = lower.indexOf(o);
    if (i !== -1) return headers[i];
  }
  return null;
}

export function parseReviewsCsv(file: File): Promise<CsvReview[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const headers = res.meta.fields || [];
        const textCol = pick(headers, TEXT_COLS);
        if (!textCol) {
          reject(new Error(`Couldn't find a review text column. Name one of your columns "text" or "review". Found: ${headers.join(", ")}`));
          return;
        }
        const ratingCol = pick(headers, RATING_COLS);
        const dateCol = pick(headers, DATE_COLS);
        const rows = res.data
          .map((row) => {
            const rating = ratingCol ? parseFloat(row[ratingCol]) : NaN;
            return {
              text: (row[textCol] || "").trim().slice(0, 4000),
              rating: rating >= 1 && rating <= 5 ? Math.round(rating) : null,
              date: dateCol && row[dateCol] ? row[dateCol] : null,
            };
          })
          .filter((r) => r.text.length > 0);
        resolve(rows);
      },
      error: (err) => reject(err),
    });
  });
}
