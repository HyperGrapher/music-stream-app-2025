"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";

const RECENT_KEY = "recent-searches-v1";

const readRecent = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
};
export function rememberSearch(q: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...readRecent().filter((r) => r !== q)].slice(0, 8)));
  } catch {
    // Recent searches are a convenience only.
  }
}

type Option = { key: string; href: string; label: string; hint?: string; image?: string | null; group: string };

/** Navbar search with autocomplete (SE-1): debounced 150 ms, min 2 chars, keyboard navigable, recent searches when empty. */
export function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const box = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text.trim()), 150);
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const query = api.search.suggest.useQuery({ q: debounced }, { enabled: debounced.length >= 2, staleTime: 30_000 });
  const data = debounced.length >= 2 ? query.data : undefined;

  const options: Option[] = [];
  if (text.trim().length >= 1) options.push({ key: "all", href: `/search?q=${encodeURIComponent(text.trim())}`, label: `Search for “${text.trim()}”`, group: "" });
  else for (const r of recent) options.push({ key: `r-${r}`, href: `/search?q=${encodeURIComponent(r)}`, label: r, group: "Recent searches" });
  for (const p of data?.people ?? []) options.push({ key: `p-${p.id}`, href: `/${p.username}`, label: p.name, hint: "Person", image: p.image, group: "People" });
  for (const t of data?.tracks ?? []) options.push({ key: `t-${t.id}`, href: t.permalink, label: t.title, hint: t.user?.name, image: t.artworkUrl, group: "Tracks" });
  for (const c of data?.albums ?? []) options.push({ key: `a-${c.id}`, href: c.permalink, label: c.title, hint: "Album", image: c.artworkUrl, group: "Albums" });
  for (const c of data?.playlists ?? []) options.push({ key: `l-${c.id}`, href: c.permalink, label: c.title, hint: "Playlist", image: c.artworkUrl, group: "Playlists" });

  const go = (option: Option | undefined) => {
    const target = option ?? options[0];
    setOpen(false);
    if (option?.key.startsWith("r-") || option?.key === "all" || !option) rememberSearch(option?.key.startsWith("r-") ? option.label : text.trim());
    router.push(target?.href ?? `/search?q=${encodeURIComponent(text.trim())}`);
  };

  return (
    <form ref={box} role="search" className="relative w-full" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { rememberSearch(text.trim()); setOpen(false); router.push(`/search?q=${encodeURIComponent(text.trim())}`); } }}>
      <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        name="q"
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        maxLength={100}
        aria-label="Search tracks and creators"
        placeholder="Search tracks and creators"
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { setRecent(readRecent()); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          else if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(options.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && open && options[active] && active > 0) { e.preventDefault(); go(options[active]); }
        }}
        className="w-full rounded-md border-none bg-gray-800 py-2 pr-4 pl-10 text-white focus:ring-1 focus:ring-orange-500"
      />
      {open && options.length > 0 && (
        <ul id={listId} role="listbox" className="absolute top-full right-0 left-0 z-50 mt-1 max-h-96 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
          {options.map((option, index) => (
            <li key={option.key} role="presentation">
              {(index === 0 || options[index - 1]!.group !== option.group) && option.group ? <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{option.group}</p> : null}
              <button type="button" role="option" aria-selected={index === active} onMouseEnter={() => setActive(index)} onClick={() => go(option)} className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm ${index === active ? "bg-zinc-800" : ""}`}>
                {option.image ? <img src={option.image} alt="" className="h-8 w-8 rounded object-cover" /> : <span className="h-8 w-8 rounded bg-zinc-800" />}
                <span className="min-w-0"><span className="block truncate text-white">{option.label}</span>{option.hint ? <span className="block truncate text-xs text-zinc-400">{option.hint}</span> : null}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
