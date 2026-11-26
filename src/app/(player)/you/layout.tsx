import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/session-user";

import { LibraryNav } from "./LibraryNav";

export const metadata = { title: "Your library | Music Stream", robots: { index: false } };

/** `/you/*` (PRD §12): the signed-in user's library. Everything here needs an account. */
export default async function YouLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/you/library");
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 text-white">
      <LibraryNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
