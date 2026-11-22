import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the scraper as a plain Node dependency instead of bundling it.
  serverExternalPackages: ["google-play-scraper"],
};

export default nextConfig;
