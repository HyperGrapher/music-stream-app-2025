import { Suspense } from "react";

import { MessagesShell } from "@/components/messages/MessagesShell";
import { requireUser } from "../you/requireUser";

export const metadata = { title: "Messages · Music Stream", robots: { index: false } };

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/messages");
  return (
    <Suspense>
      <MessagesShell>{children}</MessagesShell>
    </Suspense>
  );
}
