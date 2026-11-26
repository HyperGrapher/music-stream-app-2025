import { MessageSquare } from "lucide-react";

import { ComposeView } from "@/components/messages/ComposeView";
import { requireUser } from "../you/requireUser";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const { to } = await searchParams;
  await requireUser(to ? `/messages?to=${encodeURIComponent(to)}` : "/messages");
  if (to) return <ComposeView username={to} />;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-zinc-400">
      <MessageSquare className="h-10 w-10" aria-hidden />
      <p className="text-sm">Select a conversation, or start one from a profile.</p>
    </div>
  );
}
