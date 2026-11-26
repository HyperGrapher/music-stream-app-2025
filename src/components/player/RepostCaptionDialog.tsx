"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { friendlyError } from "@/lib/error-messages";
import { type RepostTarget, useDialogs } from "@/store/dialogs";
import { api } from "@/trpc/react";

const MAX = 140;

function Form({ target, close }: { target: RepostTarget; close: () => void }) {
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const done = () => { toast.success("Reposted"); close(); router.refresh(); };
  const onError = (error: Parameters<typeof friendlyError>[0]) => toast.error(friendlyError(error, "Could not repost"));
  const track = api.engagement.setTrackRepost.useMutation({ onSuccess: done, onError });
  const collection = api.engagement.setCollectionRepost.useMutation({ onSuccess: done, onError });
  const pending = track.isPending || collection.isPending;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (target.kind === "track") track.mutate({ trackId: target.id, reposted: true, caption });
        else collection.mutate({ collectionId: target.id, reposted: true, caption });
      }}
    >
      <textarea aria-label="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={MAX} rows={3} autoFocus placeholder="Say something about it (optional)" className="w-full resize-none rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none" />
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{caption.length} / {MAX}</span>
        <Button type="submit" disabled={pending} className="bg-orange-700 text-white hover:bg-orange-800">Repost</Button>
      </div>
    </form>
  );
}

/** "Repost with caption" (RP-1, P2): your followers see the caption above the repost in their feed. */
export function RepostCaptionDialog() {
  const target = useDialogs((s) => s.repostCaption);
  const close = useDialogs((s) => s.close);
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Repost with caption</DialogTitle>
          <DialogDescription className="truncate">{target?.title}</DialogDescription>
        </DialogHeader>
        {target ? <Form key={target.id} target={target} close={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}
