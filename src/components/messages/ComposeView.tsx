"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/error-messages";
import { cannotSendText } from "@/lib/message-links";
import { api } from "@/trpc/react";

import { Composer } from "./Composer";
import { ThreadHeader } from "./ThreadHeader";

/** `/messages?to=username` (MS-1): the first message to someone. An existing conversation with them opens instead. */
export function ComposeView({ username }: { username: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const info = api.messages.recipient.useQuery({ username }, { retry: false });
  const existing = info.data?.conversationId;
  const send = api.messages.send.useMutation({ onError: (error) => toast.error(friendlyError(error, "Could not send the message")) });

  useEffect(() => {
    if (existing) router.replace(`/messages/${existing}`);
  }, [existing, router]);

  if (info.error) {
    return <p className="p-6 text-sm text-zinc-400">We couldn&apos;t find that person.</p>;
  }
  if (!info.data || existing) {
    return <div className="space-y-3 p-4" role="status" aria-label="Loading"><Skeleton className="h-10 w-48" /></div>;
  }
  const { person } = info.data;
  return (
    <div className="flex h-full flex-col">
      <ThreadHeader person={person} />
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-zinc-400">Say hello to {person.name}.</div>
      <Composer
        autoFocus
        pending={send.isPending}
        disabledReason={info.data.canMessage ? null : cannotSendText(info.data.reason, person.name)}
        onSend={(body) =>
          send.mutate({ toUserId: person.id, body }, {
            onSuccess: (result) => {
              void utils.messages.conversations.invalidate();
              router.replace(`/messages/${result.conversationId}`);
            },
          })
        }
      />
    </div>
  );
}
