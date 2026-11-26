"use client";

import { MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/useUser";
import { useAuthPrompt } from "@/store/authPrompt";

/** "Message" on a profile (MS-1). Opens the compose screen; the server decides whether the person accepts messages from you (MS-3). */
export function MessageButton({ username }: { username: string }) {
  const { user } = useUser();
  const router = useRouter();
  const open = () => router.push(`/messages?to=${encodeURIComponent(username)}`);
  return (
    <Button type="button" variant="outline" className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800" onClick={() => (user ? open() : useAuthPrompt.getState().show("Sign in to send messages", open))}>
      <MessageSquare className="h-4 w-4" /> Message
    </Button>
  );
}
