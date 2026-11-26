"use client";

import Link from "next/link";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

const RANGES = [[1, "Today"], [7, "7 days"], [30, "30 days"], [90, "90 days"]] as const;

const regionNames = typeof Intl !== "undefined" ? new Intl.DisplayNames(undefined, { type: "region" }) : null;
function country(code: string | null) {
  if (!code) return "Unknown";
  try {
    return `${regionNames?.of(code) ?? code} (${code})`;
  } catch {
    return code;
  }
}
function flag(code: string | null) {
  return code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))) : "🌐";
}
function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m}m ${seconds % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-zinc-400">{hint}</p> : null}
    </div>
  );
}

function Bars({ title, rows, render }: { title: string; rows: { label: string | null; visitors: number; views: number }[]; render?: (label: string | null) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <section aria-label={title} className="rounded-lg border border-zinc-800 p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-zinc-400">Nothing yet.</p> : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.label ?? "none"}>
              <div className="flex justify-between gap-2"><span className="truncate">{render ? render(r.label) : (r.label ?? "Direct")}</span><span className="shrink-0 text-zinc-400 tabular-nums">{r.visitors} visitors · {r.views} views</span></div>
              <div className="mt-1 h-1.5 rounded bg-zinc-800"><div className="h-full rounded bg-orange-700" style={{ width: `${(r.views / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Series({ series }: { series: { day: Date | string; visitors: number; views: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.views));
  return (
    <figure className="rounded-lg border border-zinc-800 p-4">
      <figcaption className="mb-3 text-sm font-semibold">Visitors and page views per day</figcaption>
      <div className="flex h-32 items-end gap-1" role="img" aria-label={`${series.reduce((n, s) => n + s.views, 0)} page views over ${series.length} days`}>
        {series.map((s) => (
          <div key={String(s.day)} className="group relative flex h-full flex-1 flex-col justify-end" title={`${new Date(s.day).toISOString().slice(0, 10)}: ${s.visitors} visitors, ${s.views} views`}>
            <div className="rounded-t bg-orange-900" style={{ height: `${(s.views / max) * 100}%` }}><div className="w-full rounded-t bg-orange-500" style={{ height: `${s.views ? (s.visitors / s.views) * 100 : 0}%` }} /></div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-400"><span className="text-orange-400">■</span> visitors <span className="ml-3 text-orange-800">■</span> page views</p>
    </figure>
  );
}

/** `/admin/analytics`: who is on the site now, and how visitors used it. The live part refreshes every 10 seconds. */
export function AnalyticsView() {
  const [days, setDays] = useState<1 | 7 | 30 | 90>(7);
  const live = api.admin.onlineNow.useQuery(undefined, { refetchInterval: 10_000, refetchIntervalInBackground: false });
  const data = api.admin.analytics.useQuery({ days }, { refetchInterval: 60_000, placeholderData: (previous) => previous });
  const d = data.data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="mt-1 text-sm text-zinc-400">Visits to the site, signed in or not. IP addresses are kept for 30 days and page views for 90. Visitors who send Do Not Track are not counted.</p>
      </div>

      <section aria-labelledby="online" className="rounded-lg border border-zinc-800 p-4">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <h2 id="online" className="text-sm font-semibold text-zinc-300">Online now</h2>
            <p className="mt-1 text-4xl font-bold tabular-nums" data-testid="online-total">{live.data?.total ?? "–"}</p>
          </div>
          <p className="pb-1 text-sm text-zinc-400"><span data-testid="online-registered">{live.data?.registered ?? 0}</span> registered · <span data-testid="online-guests">{live.data?.guests ?? 0}</span> guests <span className="ml-2 text-xs">(seen in the last 2 minutes)</span></p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-zinc-400"><tr><th className="py-2 pr-3">Visitor</th><th className="pr-3">Country</th><th className="pr-3">IP</th><th className="pr-3">Page now</th><th className="pr-3">On page</th><th className="pr-3">On site</th><th className="pr-3">Pages</th><th>Device</th></tr></thead>
            <tbody>
              {(live.data?.visitors ?? []).map((v) => (
                <tr key={v.visitorId} className="border-t border-zinc-800" data-testid="online-row">
                  <td className="py-2 pr-3">{v.user ? <Link href={`/${v.user.username}`} className="font-semibold text-orange-300 hover:underline">{v.user.name}</Link> : <span className="text-zinc-300">Guest</span>}</td>
                  <td className="pr-3">{flag(v.countryCode)} {v.city ? `${v.city}, ` : ""}{country(v.countryCode)}</td>
                  <td className="pr-3 font-mono text-xs">{v.ip ?? "–"}</td>
                  <td className="max-w-[16rem] truncate pr-3 font-mono text-xs">{v.path}</td>
                  <td className="pr-3 tabular-nums">{duration(v.onPageSeconds)}</td>
                  <td className="pr-3 tabular-nums">{duration(v.onSiteSeconds)}</td>
                  <td className="pr-3 tabular-nums">{v.pages}</td>
                  <td className="text-zinc-400">{v.device}{v.browser ? ` · ${v.browser}` : ""}</td>
                </tr>
              ))}
              {live.data?.visitors.length === 0 ? <tr><td colSpan={8} className="py-6 text-center text-zinc-400">No one is on the site right now.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
        {RANGES.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)} className={cn("rounded-full border px-3 py-1 text-sm", days === value ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300 hover:border-zinc-500")}>{label}</button>
        ))}
      </div>

      {!d ? (
        <div className="grid gap-4 sm:grid-cols-3" role="status" aria-label="Loading">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <Tile label="Visitors" value={d.totals.visitors} hint={`${d.totals.registered} registered · ${d.totals.guests} guests`} />
            <Tile label="Page views" value={d.totals.views} />
            <Tile label="Sessions" value={d.totals.sessions} />
            <Tile label="Avg time on page" value={duration(d.totals.avgSecondsOnPage)} />
            <Tile label="Bounce rate" value={`${Math.round(d.totals.bounceRate * 100)}%`} hint="sessions with one page" />
            <Tile label="Pages per session" value={d.totals.sessions ? (d.totals.views / d.totals.sessions).toFixed(1) : "0"} />
          </div>

          <Series series={d.series} />

          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-label="Top pages" className="rounded-lg border border-zinc-800 p-4">
              <h3 className="mb-3 text-sm font-semibold">Top pages</h3>
              <table className="w-full text-sm"><thead className="text-left text-xs text-zinc-400"><tr><th className="pb-2">Page</th><th>Views</th><th>Visitors</th><th>Avg time</th></tr></thead>
                <tbody>{d.pages.map((p) => <tr key={p.path} className="border-t border-zinc-800"><td className="max-w-[14rem] truncate py-1.5 font-mono text-xs">{p.path}</td><td className="tabular-nums">{p.views}</td><td className="tabular-nums">{p.visitors}</td><td className="tabular-nums">{duration(Math.round(p.avgSeconds))}</td></tr>)}</tbody>
              </table>
              {d.pages.length === 0 ? <p className="text-sm text-zinc-400">Nothing yet.</p> : null}
            </section>
            <Bars title="Countries" rows={d.countries} render={(c) => `${flag(c)} ${country(c)}`} />
            <Bars title="Referrers" rows={d.referrers} render={(r) => r ?? "Direct / unknown"} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Bars title="Devices" rows={d.devices} />
              <Bars title="Browsers" rows={d.browsers} />
            </div>
          </div>

          <section aria-labelledby="sessions" className="rounded-lg border border-zinc-800 p-4">
            <h3 id="sessions" className="mb-3 text-sm font-semibold">Latest sessions</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="text-left text-xs text-zinc-400"><tr><th className="py-2 pr-3">Started</th><th className="pr-3">Visitor</th><th className="pr-3">Country</th><th className="pr-3">IP</th><th className="pr-3">Pages</th><th className="pr-3">Time</th><th className="pr-3">Entry</th><th>Exit</th></tr></thead>
                <tbody>
                  {d.sessions.map((s) => (
                    <tr key={s.sessionId} className="border-t border-zinc-800">
                      <td className="py-2 pr-3 whitespace-nowrap text-xs text-zinc-300">{new Date(s.started).toLocaleString()}</td>
                      <td className="pr-3">{s.user ? <Link href={`/${s.user.username}`} className="text-orange-300 hover:underline">{s.user.name}</Link> : "Guest"}</td>
                      <td className="pr-3">{flag(s.countryCode)} {s.countryCode ?? "–"}</td>
                      <td className="pr-3 font-mono text-xs">{s.ip ?? "–"}</td>
                      <td className="pr-3 tabular-nums">{s.pages}</td>
                      <td className="pr-3 tabular-nums">{duration(s.seconds)}</td>
                      <td className="max-w-[10rem] truncate pr-3 font-mono text-xs">{s.entry}</td>
                      <td className="max-w-[10rem] truncate font-mono text-xs">{s.exit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
