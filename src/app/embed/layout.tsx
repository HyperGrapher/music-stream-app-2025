import type { Metadata } from "next";

/** Embeds are framed on other sites: no navbar, no app chrome, never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-zinc-950 text-white">{children}</div>;
}
