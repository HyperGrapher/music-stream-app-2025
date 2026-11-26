"use client";

import { Lock, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollPanel } from "@/components/ui/scroll-panel";
import { friendlyError } from "@/lib/error-messages";
import { api } from "@/trpc/react";

const REASON: Record<string, string> = { INVALID: "not a valid username (3 to 25 letters, numbers, - or _)", BUILT_IN: "already reserved by the system", DUPLICATE: "listed twice" };

/** `/admin/reserved`: extra reserved usernames. The built-in list (code) is shown but cannot be touched. */
export function ReservedNames() {
  const utils = api.useUtils();
  const data = api.admin.reservedNames.useQuery();
  const [single, setSingle] = useState("");
  const [filter, setFilter] = useState("");
  const [report, setReport] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => void utils.admin.reservedNames.invalidate();
  const onError = (error: Parameters<typeof friendlyError>[0]) => toast.error(friendlyError(error, "Could not update the list"));

  const add = api.admin.addReservedNames.useMutation({
    onError,
    onSuccess: (result) => {
      refresh();
      const lines = [`Added ${result.added} ${result.added === 1 ? "name" : "names"}.`];
      if (result.existing.length) lines.push(`${result.existing.length} already in the list.`);
      for (const r of result.rejected.slice(0, 8)) lines.push(`Line ${r.line} "${r.text}": ${REASON[r.reason]}.`);
      if (result.rejected.length > 8) lines.push(`…and ${result.rejected.length - 8} more skipped lines.`);
      setReport(lines.join("\n"));
      setSingle("");
    },
  });
  const setBlocked = api.admin.setReservedBlocked.useMutation({ onSuccess: refresh, onError });
  const remove = api.admin.removeReservedName.useMutation({ onSuccess: () => { refresh(); toast.success("Removed"); }, onError });

  const custom = useMemo(() => (data.data?.custom ?? []).filter((r) => r.name.includes(filter.trim().toLowerCase())), [data.data, filter]);
  const builtIn = data.data?.builtIn ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Reserved usernames</h1>
        <p className="mt-1 text-sm text-zinc-400">People cannot register or rename to a reserved name. Names you add here sit on top of the built-in list, which is part of the code and cannot be changed.</p>
      </div>

      <section aria-labelledby="add-names" className="space-y-3 rounded-lg border border-zinc-800 p-4">
        <h2 id="add-names" className="font-semibold">Add names</h2>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (single.trim()) add.mutate({ text: single }); }}>
          <Input aria-label="Name to reserve" placeholder="A name to reserve" value={single} onChange={(e) => setSingle(e.target.value)} className="max-w-xs border-zinc-700 bg-zinc-900" />
          <Button type="submit" disabled={!single.trim() || add.isPending} className="bg-orange-700 text-white hover:bg-orange-800">Reserve</Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={file}
            type="file"
            accept=".txt,text/plain"
            aria-label="Text file with one name per line"
            className="sr-only"
            onChange={async (event) => {
              const chosen = event.target.files?.[0];
              event.target.value = "";
              if (!chosen) return;
              if (chosen.size > 200_000) return void toast.error("That file is larger than 200 KB");
              add.mutate({ text: await chosen.text(), note: `file: ${chosen.name}`.slice(0, 100) });
            }}
          />
          <Button type="button" variant="outline" className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800" disabled={add.isPending} onClick={() => file.current?.click()}><Upload className="h-4 w-4" /> Upload a .txt file</Button>
          <span className="text-xs text-zinc-400">One name per line. Blank lines and lines starting with # are ignored. Up to 5 000 names.</span>
        </div>
        {report ? <pre role="status" className="rounded bg-zinc-900 p-3 text-xs whitespace-pre-wrap text-zinc-300">{report}</pre> : null}
      </section>

      <section aria-labelledby="custom-names">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="custom-names" className="font-semibold">Added by admins ({data.data?.custom.length ?? 0})</h2>
          <Input aria-label="Filter names" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-[12rem] border-zinc-700 bg-zinc-900" />
        </div>
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-zinc-900/70 text-left text-xs text-zinc-400"><tr><th className="p-3">Name</th><th className="p-3">Status</th><th className="p-3">Note</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {custom.map((r) => (
                <tr key={r.name} className="border-t border-zinc-800" data-testid="reserved-row">
                  <td className="p-3 font-mono">{r.name}</td>
                  <td className="p-3">{r.blocked ? <span className="text-red-300">Blocked</span> : <span className="text-green-300">Allowed</span>}</td>
                  <td className="p-3 text-zinc-400">{r.note ?? ""}</td>
                  <td className="flex justify-end gap-2 p-3">
                    <Button size="sm" variant="outline" className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800" disabled={setBlocked.isPending} onClick={() => setBlocked.mutate({ name: r.name, blocked: !r.blocked })}>{r.blocked ? "Unblock" : "Block"}<span className="sr-only"> {r.name}</span></Button>
                    <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-red-300" disabled={remove.isPending} onClick={() => remove.mutate({ name: r.name })}><Trash2 className="h-4 w-4" /><span className="sr-only">Remove {r.name}</span></Button>
                  </td>
                </tr>
              ))}
              {custom.length === 0 ? <tr><td colSpan={4} className="p-6 text-center text-zinc-400">{data.isLoading ? "Loading…" : "No names added yet."}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="built-in-names">
        <h2 id="built-in-names" className="mb-2 flex items-center gap-2 font-semibold"><Lock className="h-4 w-4 text-zinc-400" /> Built-in ({builtIn.length}) <span className="text-xs font-normal text-zinc-400">read-only, part of the code</span></h2>
        <ScrollPanel className="max-h-48">
          <ul className="flex flex-wrap gap-1.5 p-1" aria-label="Built-in reserved names">
            {builtIn.map((name) => <li key={name} className="rounded bg-zinc-900 px-2 py-0.5 font-mono text-xs text-zinc-300">{name}</li>)}
          </ul>
        </ScrollPanel>
      </section>
    </div>
  );
}
