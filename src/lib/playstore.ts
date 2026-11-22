import gplay from "google-play-scraper";
import type { AppMeta, Review } from "./types";

/** Accepts a Play Store URL or a bare package id. Returns the package id or null. */
export function parseAppId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  try {
    if (s.startsWith("http")) {
      const url = new URL(s);
      const id = url.searchParams.get("id");
      return id && isPackageId(id) ? id : null;
    }
  } catch {
    return null;
  }
  return isPackageId(s) ? s : null;
}

function isPackageId(s: string) {
  return /^[a-zA-Z][\w]*(\.[a-zA-Z0-9_]+)+$/.test(s);
}

export async function fetchPlayStore(
  appId: string,
  num: number,
  country = "in"
): Promise<{ app: AppMeta; reviews: Review[] }> {
  let meta: AppMeta = { appId, title: appId, source: "play_store" };
  try {
    const app = await gplay.app({ appId, country, lang: "en" });
    meta = {
      appId,
      title: app.title,
      icon: app.icon,
      storeRating: app.score ?? null,
      totalRatings: app.ratings ?? null,
      source: "play_store",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/404|not found/i.test(msg)) {
      throw new Error(`No Play Store app found with the ID "${appId}". Check the ID in the app's Play Store URL.`);
    }
    // Metadata is nice-to-have; carry on with reviews.
  }

  const res = await gplay.reviews({
    appId,
    country,
    lang: "en",
    // The bundled types declare `sort` as an enum value rather than the enum object.
    sort: (gplay.sort as unknown as { NEWEST: never }).NEWEST,
    num,
  });

  const reviews: Review[] = res.data
    .filter((r) => r.text && r.text.trim().length > 0)
    .map((r) => ({
      id: r.id,
      text: r.text.trim(),
      rating: r.score ?? null,
      date: r.date ? new Date(r.date).toISOString() : null,
      version: r.version ?? null,
      thumbsUp: r.thumbsUp ?? 0,
    }));

  return { app: meta, reviews };
}
