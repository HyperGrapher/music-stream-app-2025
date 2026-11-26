import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/session-user";

/** Pages render in parallel with their layout, so each one must guard itself too. */
export async function requireUser(next: string) {
  const user = await getSessionUser();
  if (!user) redirect(`/signin?next=${next}`);
  return user;
}
