import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/session-user";

import { SettingsNav } from "./SettingsNav";

export const metadata = { title: "Settings | Music Stream", robots: { index: false } };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/settings/profile");
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 text-white md:grid-cols-[200px_minmax(0,1fr)]">
      <SettingsNav />
      <div className="min-w-0 pb-24">{children}</div>
    </div>
  );
}
