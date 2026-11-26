import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SearchPage } from "./SearchPage";

export const metadata: Metadata = { title: "Search | Music Stream", robots: { index: false } };

const TABS = ["all", "tracks", "people", "albums", "playlists"] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; genre?: string; duration?: string; added?: string; license?: string }> }) {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 100) ?? "";
  // `#tag` searches are tag searches (SE-4).
  const tag = /^#([\p{L}\p{N}_-]{1,40})$/u.exec(q)?.[1];
  if (tag) redirect(`/tags/${encodeURIComponent(tag.toLowerCase())}`);
  const tab = TABS.find((t) => t === params.tab) ?? "all";
  return <SearchPage q={q} tab={tab} filters={{ genre: params.genre, duration: params.duration, added: params.added, license: params.license }} />;
}
