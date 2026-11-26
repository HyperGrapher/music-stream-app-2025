"use client";

import Link from "next/link";

import { api } from "@/trpc/react";

/** ST-3: upload-time usage and the plan link. */
export function UsageBar() {
  const usage = api.studio.usage.useQuery();
  if (!usage.data) return null;
  const { usedMs, limitMs, plan } = usage.data;
  const minutes = (ms: number) => Math.round(ms / 60_000);
  const pct = limitMs ? Math.min(100, (usedMs / limitMs) * 100) : 0;
  return (
    <div className="mb-5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4" data-testid="usage-bar">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{limitMs ? <>{minutes(usedMs)} of {minutes(limitMs)} min of upload time used</> : <>{minutes(usedMs)} min uploaded · unlimited on Pro</>}</span>
        <Link href="/settings/plan" className="text-orange-400 hover:underline">{plan === "PRO" ? "Manage plan" : "Upgrade to Pro"}</Link>
      </div>
      {limitMs ? <div className="mt-2 h-2 overflow-hidden rounded bg-zinc-800"><div className={`h-full ${pct > 90 ? "bg-red-500" : "bg-orange-500"}`} style={{ width: `${pct}%` }} /></div> : null}
    </div>
  );
}
