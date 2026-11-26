import Link from "next/link";

import { api } from "@/trpc/server";

/** AD-1: counts and links. */
export default async function Page() {
  const stats = await api.admin.dashboard();
  const tiles = [["Open reports", stats.openReports, "/admin/reports"], ["New users (7 d)", stats.newUsers, "/admin/users"], ["Uploads (7 d)", stats.uploads, null], ["Plays (7 d)", stats.plays, null]] as const;
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, href]) => {
          const body = <><p className="text-xs tracking-wide text-zinc-400 uppercase">{label}</p><p className="mt-1 text-3xl font-bold tabular-nums">{value.toLocaleString()}</p></>;
          return href ? <Link key={label} href={href} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 hover:border-zinc-600" data-testid={`stat-${label}`}>{body}</Link> : <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4" data-testid={`stat-${label}`}>{body}</div>;
        })}
      </div>
    </div>
  );
}
