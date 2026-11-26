import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { UploadApp } from "@/components/upload/UploadApp";
import { getSessionUser } from "@/server/session-user";

export const metadata: Metadata = { title: "Upload | Music Stream", robots: { index: false } };

export default async function UploadPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/upload");
  return <UploadApp username={user.username} />;
}
