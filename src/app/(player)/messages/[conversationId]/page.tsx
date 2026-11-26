import { notFound } from "next/navigation";

import { ThreadView } from "@/components/messages/ThreadView";
import { requireUser } from "../../you/requireUser";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  await requireUser(`/messages/${conversationId}`);
  if (!UUID.test(conversationId)) notFound();
  return <ThreadView key={conversationId} conversationId={conversationId} />;
}
