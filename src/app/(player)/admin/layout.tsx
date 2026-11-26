import Link from "next/link";
import { notFound } from "next/navigation";

import { getSessionUser } from "@/server/session-user";

export const metadata = { title: "Admin | Music Stream", robots: { index: false } };

/** `/admin/*`: admins only. Everyone else gets a plain 404 (the area does not exist for them). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user?.role !== "ADMIN") notFound();
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 pb-32 text-white">
      <nav aria-label="Admin" className="flex gap-2 border-b border-zinc-800 pb-3 text-sm">
        <span className="mr-3 py-1.5 font-bold text-orange-500">Admin</span>
        <Link href="/admin" className="rounded-full px-3 py-1.5 text-zinc-300 hover:text-white">Dashboard</Link>
        <Link href="/admin/reports" className="rounded-full px-3 py-1.5 text-zinc-300 hover:text-white">Reports</Link>
        <Link href="/admin/users" className="rounded-full px-3 py-1.5 text-zinc-300 hover:text-white">Users</Link>
        <Link href="/admin/analytics" className="rounded-full px-3 py-1.5 text-zinc-300 hover:text-white">Analytics</Link>
        <Link href="/admin/reserved" className="rounded-full px-3 py-1.5 text-zinc-300 hover:text-white">Reserved names</Link>
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  );
}
