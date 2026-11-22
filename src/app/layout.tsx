import type { Metadata } from "next";
import "@fontsource-variable/schibsted-grotesk";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Review-to-Roadmap: turn app reviews into a ranked roadmap",
  description:
    "Paste a Play Store link. Get user-pain themes, trends, real quotes and a RICE-ranked list of what to build or fix next.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
