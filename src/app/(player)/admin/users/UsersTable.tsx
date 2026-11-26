"use client";

import Link from "next/link";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";

/** `/admin/users` (AD-3): search by username, name or email. */
export function UsersTable() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const list = api.admin.users.useQuery({ q: search || undefined });
  return (
    <div>
      <h1 className="text-2xl font-bold">Users</h1>
      <form className="mt-4" role="search" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}>
        <Input aria-label="Search users" placeholder="Username, name or email" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm border-zinc-700 bg-zinc-900" />
      </form>
      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-zinc-900/70 text-left text-xs text-zinc-400"><tr><th className="p-3">User</th><th className="p-3">Email</th><th className="p-3">Status</th><th className="p-3">Plan</th><th className="p-3">Joined</th></tr></thead>
          <tbody>
            {(list.data?.items ?? []).map((u) => (
              <tr key={u.id} className="border-t border-zinc-800" data-testid="user-row">
                <td className="p-3"><Link href={`/admin/users/${u.id}`} className="font-semibold hover:text-orange-400">{u.name}</Link> <span className="text-zinc-500">@{u.username}</span>{u.role === "ADMIN" && <span className="ml-2 rounded bg-orange-500/20 px-1.5 text-[10px] font-bold text-orange-300">ADMIN</span>}</td>
                <td className="p-3 text-zinc-400">{u.email}</td>
                <td className="p-3">{u.status}</td>
                <td className="p-3">{u.plan}</td>
                <td className="p-3 text-zinc-400">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
