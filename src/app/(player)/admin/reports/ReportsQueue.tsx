"use client";

import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

type Status = "OPEN" | "RESOLVED" | "DISMISSED";
type Type = "TRACK" | "COLLECTION" | "COMMENT" | "USER" | "MESSAGE";
type Target = { targetType: Type; targetId: string };
const STATUSES: Status[] = ["OPEN", "RESOLVED", "DISMISSED"];
const TYPES: Type[] = ["TRACK", "COLLECTION", "COMMENT", "USER", "MESSAGE"];
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function Detail({ target, onClose }: { target: Target; onClose: () => void }) {
  const utils = api.useUtils();
  const detail = api.admin.reportDetail.useQuery(target);
  const [reason, setReason] = useState("");
  const done = (message: string) => { toast.success(message); void utils.admin.reports.invalidate(); void utils.admin.reportDetail.invalidate(); void utils.admin.dashboard.invalidate(); };
  const onError = (e: Parameters<typeof friendlyError>[0]) => toast.error(friendlyError(e, "That did not work"));
  const dismiss = api.admin.dismiss.useMutation({ onSuccess: () => { done("Dismissed"); onClose(); }, onError });
  const remove = api.admin.remove.useMutation({ onSuccess: () => { done("Removed"); onClose(); }, onError });
  const restore = api.admin.restore.useMutation({ onSuccess: () => done("Restored"), onError });
  const suspend = api.admin.suspend.useMutation({ onSuccess: () => { done("User suspended"); onClose(); }, onError });
  const d = detail.data;
  const owner = d?.preview?.owner;
  return (
    <div className="space-y-5">
      {!d && <p className="text-sm text-zinc-400">Loading…</p>}
      {d && (
        <>
          <section aria-label="Reported content" className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-xs text-zinc-400 uppercase">{label(target.targetType)}</p>
            {d.preview?.href ? <Link href={d.preview.href} target="_blank" className="font-semibold hover:text-orange-400">{d.preview.title}</Link> : <p className="font-semibold">{d.preview?.title ?? "No longer exists"}</p>}
            {d.preview?.text && <blockquote className="mt-2 border-l-2 border-zinc-700 pl-3 text-sm text-zinc-300" data-testid="reported-text">{d.preview.text}</blockquote>}
            {owner && <p className="mt-2 text-sm text-zinc-400">By <Link className="text-zinc-200 hover:underline" href={`/admin/users/${owner.id}`}>{owner.name}</Link>{d.ownerHistory > 0 ? <span className="ml-2 rounded bg-red-500/20 px-1.5 text-xs text-red-300">{d.ownerHistory} earlier action{d.ownerHistory === 1 ? "" : "s"}</span> : null}</p>}
            {d.preview?.removed && <p className="mt-2 text-sm text-red-300">Currently removed{d.preview.reason ? `: ${d.preview.reason}` : ""}</p>}
          </section>
          <section aria-label="Reports"><h3 className="mb-2 text-sm font-bold uppercase text-zinc-400">Reports ({d.reports.length})</h3>
            <ul className="space-y-2 text-sm">{d.reports.map((r) => <li key={r.id} className="rounded border border-zinc-800 p-2"><span className="font-semibold">{label(r.reason)}</span> · {r.reporter.name} · <span className="text-zinc-400">{label(r.status)}, {formatDistanceToNowStrict(new Date(r.createdAt), { addSuffix: true })}</span>{r.details && <p className="mt-1 text-zinc-300">{r.details}</p>}</li>)}</ul>
          </section>
          {d.actions.length > 0 && <section aria-label="Audit log"><h3 className="mb-2 text-sm font-bold uppercase text-zinc-400">Audit log</h3><ul className="space-y-1 text-sm text-zinc-300">{d.actions.map((a) => <li key={a.id}>{a.action} by {a.admin.username}{a.reason ? `: ${a.reason}` : ""} <span className="text-zinc-400">{formatDistanceToNowStrict(new Date(a.createdAt), { addSuffix: true })}</span></li>)}</ul></section>}
          <section aria-label="Actions" className="space-y-3 border-t border-zinc-800 pt-4">
            <Input aria-label="Reason" placeholder="Reason (required to remove or suspend)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} className="border-zinc-700 bg-zinc-900" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => dismiss.mutate({ ...target, note: reason || undefined })}>Dismiss</Button>
              <Button variant="destructive" disabled={!reason.trim()} onClick={() => remove.mutate({ ...target, reason })}>{target.targetType === "USER" ? "Suspend user" : "Remove content"}</Button>
              {d.preview?.removed && target.targetType !== "COMMENT" && <Button variant="outline" onClick={() => restore.mutate({ ...target })}>Restore</Button>}
              {owner && target.targetType !== "USER" && <Button variant="outline" disabled={!reason.trim()} onClick={() => suspend.mutate({ userId: owner.id, reason })}>Suspend owner</Button>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** `/admin/reports` (AD-2): grouped by target, most distinct reporters first; the drawer holds the details and actions. */
export function ReportsQueue() {
  const [status, setStatus] = useState<Status>("OPEN");
  const [type, setType] = useState<Type | undefined>(undefined);
  const [open, setOpen] = useState<Target | null>(null);
  const list = api.admin.reports.useQuery({ status, targetType: type });
  return (
    <div>
      <h1 className="text-2xl font-bold">Reports</h1>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)} className={cn("rounded-full border px-3 py-1 text-sm", status === s ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300")}>{label(s)}</button>)}
        <span className="mx-2 text-zinc-400">|</span>
        <button aria-pressed={!type} onClick={() => setType(undefined)} className={cn("rounded-full border px-3 py-1 text-sm", !type ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300")}>All types</button>
        {TYPES.map((t) => <button key={t} aria-pressed={type === t} onClick={() => setType(t)} className={cn("rounded-full border px-3 py-1 text-sm", type === t ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300")}>{label(t)}</button>)}
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-zinc-900/70 text-left text-xs text-zinc-400"><tr><th className="p-3">Reported</th><th className="p-3">Type</th><th className="p-3 text-right">Reporters</th><th className="p-3">Reasons</th><th className="p-3 text-right">Oldest</th></tr></thead>
          <tbody>
            {(list.data?.items ?? []).map((item) => (
              <tr key={`${item.targetType}${item.targetId}`} className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-900/50" onClick={() => setOpen({ targetType: item.targetType, targetId: item.targetId })} data-testid="report-row">
                <td className="p-3"><button className="text-left font-semibold hover:text-orange-400" onClick={() => setOpen({ targetType: item.targetType, targetId: item.targetId })}>{item.preview?.title ?? "No longer exists"}</button>{item.preview?.text && <p className="max-w-md truncate text-xs text-zinc-400">{item.preview.text}</p>}</td>
                <td className="p-3">{label(item.targetType)}</td>
                <td className="p-3 text-right tabular-nums">{item.reporters}</td>
                <td className="p-3 text-zinc-400">{item.reasons.map(label).join(", ")}</td>
                <td className="p-3 text-right text-zinc-400">{formatDistanceToNowStrict(new Date(item.oldest), { addSuffix: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data?.items.length === 0 && <p className="p-8 text-center text-sm text-zinc-400">Nothing here.</p>}
      </div>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-zinc-800 bg-zinc-950 text-white sm:max-w-2xl">
          <DialogHeader><DialogTitle>Review report</DialogTitle><DialogDescription className="text-zinc-400">What was reported, who reported it, and your options.</DialogDescription></DialogHeader>
          {open && <Detail key={`${open.targetType}${open.targetId}`} target={open} onClose={() => setOpen(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
