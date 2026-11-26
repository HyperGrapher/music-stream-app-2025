import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/session-user";

export const metadata = { title: "Creator Studio | Music Stream", robots: { index: false } };

/** `/studio/*` (PRD §15) needs an account. The table pages use `StudioFrame`; the editors keep their own layout. */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  if (!(await getSessionUser())) redirect("/signin?next=/studio/tracks");
  return children;
}
