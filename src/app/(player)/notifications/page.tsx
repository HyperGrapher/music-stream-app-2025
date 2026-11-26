import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/session-user";

import { NotificationsPage } from "./NotificationsPage";

export const metadata = { title: "Notifications | Music Stream", robots: { index: false } };

export default async function Page() {
  if (!(await getSessionUser())) redirect("/signin?next=/notifications");
  return <NotificationsPage />;
}
