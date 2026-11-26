"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/error-messages";
import { api } from "@/trpc/react";

/** `/admin/users/[id]` (AD-3, AD-4): profile summary, counts, history, and the moderation actions. */
export function UserAdmin({ userId }: { userId: string }) {
  const utils = api.useUtils();
  const query = api.admin.user.useQuery({ userId });
  const [reason, setReason] = useState("");
  const refresh = () => { void utils.admin.user.invalidate(); void utils.admin.users.invalidate(); };
  const onError = (e: Parameters<typeof friendlyError>[0]) => toast.error(friendlyError(e, "That did not work"));
  const suspend = api.admin.suspend.useMutation({ onSuccess: () => { toast.success("Suspended"); setReason(""); refresh(); }, onError });
  const unsuspend = api.admin.unsuspend.useMutation({ onSuccess: () => { toast.success("Unsuspended"); refresh(); }, onError });
  const verify = api.admin.setVerified.useMutation({ onSuccess: refresh, onError });
  const plan = api.admin.setPlan.useMutation({ onSuccess: refresh, onError });
  if (!query.data) return <p className="text-sm text-zinc-400">{query.error ? query.error.message : "Loading…"}</p>;
  const { user, counts, actions } = query.data;
  return (
    <div>
      <h1 className="text-2xl font-bold">{user.name} <span className="text-base font-normal text-zinc-400">@{user.username}</span></h1>
      <p className="mt-1 text-sm text-zinc-400">{user.email} · {user.status} · {user.plan} · joined {new Date(user.createdAt).toLocaleDateString()} · <Link className="text-orange-400 hover:underline" href={`/${user.username}`}>public profile</Link></p>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        {Object.entries({ Tracks: counts.tracks, Collections: counts.collections, Comments: counts.comments, "Reports against": counts.reportsAgainst, "Reports filed": counts.reportsBy }).map(([k, v]) => <div key={k} className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><dt className="text-xs text-zinc-400">{k}</dt><dd className="text-xl font-bold tabular-nums">{v}</dd></div>)}
      </dl>
      <section className="mt-6 space-y-3" aria-label="Actions">
        {user.role !== "ADMIN" && (
          user.status === "SUSPENDED" ? (
            <Button variant="outline" onClick={() => unsuspend.mutate({ userId })}>Unsuspend</Button>
          ) : (
            <div className="flex max-w-xl gap-2">
              <Input aria-label="Suspension reason" placeholder="Reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} className="border-zinc-700 bg-zinc-900" />
              <Button variant="destructive" disabled={!reason.trim()} onClick={() => suspend.mutate({ userId, reason })}>Suspend</Button>
            </div>
          )
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => verify.mutate({ userId, verified: !user.verified })}>{user.verified ? "Remove verified badge" : "Give verified badge"}</Button>
          <Button variant="outline" onClick={() => plan.mutate({ userId, plan: user.plan === "PRO" ? "FREE" : "PRO" })}>Switch to {user.plan === "PRO" ? "Free" : "Pro"}</Button>
        </div>
      </section>
      <h2 className="mt-8 mb-2 text-lg font-bold">Audit log</h2>
      <ul className="space-y-1 text-sm text-zinc-300">
        {actions.map((a) => <li key={a.id}>{new Date(a.createdAt).toLocaleString()} · {a.action} by {a.admin.username}{a.reason ? `: ${a.reason}` : ""}</li>)}
        {actions.length === 0 && <li className="text-zinc-400">No actions yet.</li>}
      </ul>
    </div>
  );
}
