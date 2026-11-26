"use client";

import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useState } from "react";

import { UpsellDialog } from "@/components/upload/EditorFields";
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/trpc/react";

type Data = RouterOutputs["insights"]["get"];
const RANGE_LABEL = { "7": "7 days", "30": "30 days", "90": "90 days", "365": "12 months", all: "All time" } as const;
type Range = keyof typeof RANGE_LABEL;
const SOURCE_LABEL: Record<string, string> = { PROFILE: "Profile", TRACK_PAGE: "Track page", COLLECTION: "Collection", FEED: "Feed", HOME: "Home", DISCOVER: "Discover", SEARCH: "Search", CHARTS: "Charts", LIBRARY: "Library", HISTORY: "History", STATION: "Station", EMBED: "Embed", OTHER: "Other" };
const TILES = [["plays", "Plays"], ["likes", "Likes"], ["reposts", "Reposts"], ["comments", "Comments"], ["downloads", "Downloads"], ["newFollowers", "New followers"]] as const;

function Tile({ label, value, before }: { label: string; value: number; before: number | null }) {
  const delta = before === null ? null : value - before;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4" data-testid={`tile-${label}`}>
      <p className="text-xs tracking-wide text-zinc-400 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      {delta !== null && <p className={cn("text-xs", delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-zinc-400")}>{delta > 0 ? "+" : ""}{delta.toLocaleString()} vs previous period</p>}
    </div>
  );
}

/** Plays over time as an accessible SVG area chart (IN-3): one series, a single accent colour, with a text summary. */
function PlaysChart({ series, weekly }: { series: Data["series"]; weekly: boolean }) {
  const w = 720, h = 200, pad = 28;
  const max = Math.max(1, ...series.map((s) => s.plays));
  const x = (i: number) => pad + (series.length <= 1 ? 0 : (i / (series.length - 1)) * (w - pad * 2));
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const line = series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.plays).toFixed(1)}`).join(" ");
  const total = series.reduce((n, s) => n + s.plays, 0);
  const fmt = (d: Date) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Plays per ${weekly ? "week" : "day"}: ${total} in total, peak ${max}`} className="w-full">
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={pad} x2={w - pad} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" className="text-zinc-800" /><text x={pad - 6} y={y(max * f) + 4} textAnchor="end" className="fill-zinc-500 text-[10px]">{Math.round(max * f)}</text></g>)}
        {series.length > 1 && <path d={`${line} L${x(series.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} className="fill-orange-500/15" />}
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2} className="text-orange-500" />
        {series.length <= 31 && series.map((s, i) => <circle key={i} cx={x(i)} cy={y(s.plays)} r={2.5} className="fill-orange-500"><title>{`${fmt(s.start)}: ${s.plays} plays`}</title></circle>)}
        {series.length > 0 && <><text x={pad} y={h - 8} className="fill-zinc-500 text-[10px]">{fmt(series[0]!.start)}</text><text x={w - pad} y={h - 8} textAnchor="end" className="fill-zinc-500 text-[10px]">{fmt(series.at(-1)!.start)}</text></>}
      </svg>
      <figcaption className="sr-only">{total} plays in this period.</figcaption>
    </figure>
  );
}

function Bars({ rows, label }: { rows: { key: string; label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-zinc-400">No plays in this period.</p>;
  return (
    <ul aria-label={label} className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="text-sm">
          <div className="flex justify-between"><span>{r.label}</span><span className="tabular-nums text-zinc-400">{r.value}</span></div>
          <div className="mt-1 h-1.5 rounded bg-zinc-800"><div className="h-full rounded bg-orange-700" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Locked({ feature, onUpsell }: { feature: string; onUpsell: () => void }) {
  return <button type="button" onClick={onUpsell} className="w-full rounded border border-dashed border-zinc-700 p-6 text-sm text-zinc-400 hover:border-zinc-500">{feature} <span className="ml-1 rounded bg-orange-500/20 px-1.5 text-[10px] font-bold text-orange-300">PRO</span></button>;
}

/** `/studio/insights` (IN-1..IN-6). */
export function InsightsView() {
  const [range, setRange] = useState<Range>("7");
  const [trackId, setTrackId] = useState("");
  const [upsell, setUpsell] = useState<string | null>(null);
  const me = api.studio.usage.useQuery();
  const tracks = api.insights.tracks.useQuery();
  const data = api.insights.get.useQuery({ range, trackId: trackId || undefined }, { placeholderData: (prev) => prev });
  const pro = (me.data?.plan ?? "FREE") === "PRO";
  const d = data.data;
  const regions = typeof Intl !== "undefined" ? new Intl.DisplayNames(undefined, { type: "region" }) : null;

  return (
    <div>
      <h1 className="text-2xl font-bold">Insights</h1>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => {
          const allowed = r === "7" || r === "all" || pro;
          return (
            <button key={r} aria-pressed={range === r} onClick={() => (allowed ? setRange(r) : setUpsell(`The ${RANGE_LABEL[r]} range`))} className={cn("rounded-full border px-3 py-1 text-sm", range === r ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300")}>
              {RANGE_LABEL[r]}{!allowed && <span className="ml-1.5 rounded bg-orange-500/20 px-1 text-[10px] font-bold text-orange-300">PRO</span>}
            </button>
          );
        })}
        <select aria-label="Track" value={trackId} onChange={(e) => (pro || !e.target.value ? setTrackId(e.target.value) : setUpsell("Per-track insights"))} className="ml-auto rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm">
          <option value="">All tracks</option>
          {(tracks.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}{pro ? "" : " (Pro)"}</option>)}
        </select>
      </div>

      {data.error && <p className="mt-6 text-sm text-red-300">{data.error.message}</p>}
      {d && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {TILES.filter(([k]) => !(trackId && k === "newFollowers")).map(([key, label]) => <Tile key={key} label={label} value={d.totals[key]} before={d.previous ? d.previous[key] : null} />)}
          </div>

          <section className="mt-8" aria-labelledby="plays-over-time">
            <h2 id="plays-over-time" className="mb-2 text-lg font-bold">Plays over time{d.weekly ? " (weekly)" : ""}</h2>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"><PlaysChart series={d.series} weekly={d.weekly} /></div>
          </section>

          <section className="mt-8" aria-labelledby="top-tracks">
            <h2 id="top-tracks" className="mb-2 text-lg font-bold">Top tracks</h2>
            {d.topTracks.length === 0 ? <p className="text-sm text-zinc-400">No plays in this period yet.</p> : (
              <table className="w-full text-sm"><thead className="text-left text-xs text-zinc-400"><tr><th className="py-2">Track</th><th className="text-right">Plays</th><th className="text-right">Likes</th><th className="text-right">Completion</th></tr></thead>
                <tbody>{d.topTracks.map((t) => <tr key={t.id} className="border-t border-zinc-800" data-testid="top-track"><td className="py-2"><Link href={t.permalink} className="hover:text-orange-400">{t.title}</Link></td><td className="text-right tabular-nums">{t.plays}</td><td className="text-right tabular-nums">{t.likes}</td><td className="text-right tabular-nums">{t.completionRate === null ? "—" : `${Math.round(t.completionRate * 100)}%`}</td></tr>)}</tbody>
              </table>
            )}
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <section aria-labelledby="countries"><h2 id="countries" className="mb-2 text-lg font-bold">Top countries</h2>
              {d.breakdowns ? <Bars label="Top countries" rows={d.breakdowns.countries.map((c) => ({ key: c.country, label: c.country === "Unknown" ? "Unknown" : (regions?.of(c.country) ?? c.country), value: c.plays }))} /> : <Locked feature="Top countries" onUpsell={() => setUpsell("Top countries")} />}
            </section>
            <section aria-labelledby="sources"><h2 id="sources" className="mb-2 text-lg font-bold">Plays by source</h2>
              {d.breakdowns ? <Bars label="Plays by source" rows={d.breakdowns.sources.map((s) => ({ key: s.source, label: SOURCE_LABEL[s.source] ?? s.source, value: s.plays }))} /> : <Locked feature="Plays by source" onUpsell={() => setUpsell("Plays by source")} />}
            </section>
            <section aria-labelledby="listeners"><h2 id="listeners" className="mb-2 text-lg font-bold">Top listeners</h2>
              {d.breakdowns ? (d.breakdowns.listeners.length === 0 ? <p className="text-sm text-zinc-400">No signed-in listeners yet.</p> : <ul className="space-y-1.5 text-sm">{d.breakdowns.listeners.map((l) => <li key={l.id} className="flex justify-between"><Link href={`/${l.username}`} className="hover:text-orange-400">{l.name}</Link><span className="tabular-nums text-zinc-400">{l.plays}</span></li>)}</ul>) : <Locked feature="Top listeners" onUpsell={() => setUpsell("Top listeners")} />}
            </section>
          </div>
          {d.breakdowns && range !== "7" && range !== "30" && <p className="mt-3 text-xs text-zinc-400">Countries, sources and listeners cover at most the last 90 days.</p>}
        </>
      )}
      {data.isLoading && <div className="mt-6 grid gap-4 sm:grid-cols-3" role="status" aria-label="Loading">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}<Skeleton className="h-64 sm:col-span-3" /></div>}
      <UpsellDialog open={upsell !== null} onClose={() => setUpsell(null)} feature={upsell ?? ""} />
    </div>
  );
}
