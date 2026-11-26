import { redirect } from "next/navigation";

import { WhoToFollow } from "@/app/_components/WhoToFollow";
import { getSessionUser } from "@/server/session-user";

import { FeedPage } from "./FeedPage";

export const metadata = { title: "Feed | Music Stream", robots: { index: false } };

export default async function Page() {
  if (!(await getSessionUser())) redirect("/signin?next=/feed");
  return <FeedPage empty={<WhoToFollow />} />;
}
