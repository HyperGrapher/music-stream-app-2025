"use client";

import { Download, Flag, Radio, ExternalLink, Link2, ListEnd, ListPlus, ListStart, MoreHorizontal, Pencil, Share2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useUser } from "@/hooks/useUser";
import { vanillaApi } from "@/trpc/vanilla";
import { startReport } from "./ReportDialog";
import { useAuthPrompt } from "@/store/authPrompt";
import { useDialogs } from "@/store/dialogs";
import { usePlayerStore } from "@/store/player";
import type { PlayerTrack } from "@/types/player-track";
import { cn } from "@/lib/utils";

/** Absolute URL for a path, with the optional `#t=` start time. */
export const absoluteUrl = (path: string) => new URL(path, window.location.origin).toString();

export function copyText(text: string, done = "Link copied") {
  void navigator.clipboard.writeText(text).then(() => toast.success(done)).catch(() => toast.error("Could not copy"));
}

/** The "…" menu of every track row and card (PRD PL-P6). */
export function TrackMenu({ track, className }: { track: PlayerTrack; className?: string }) {
  const { user } = useUser();
  const playNext = usePlayerStore((s) => s.playNext);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const isOwner = !!user && user.id === track.userId;
  const path = track.permalink ?? "";
  const download = track.downloadable === true || isOwner;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`More actions for ${track.title}`} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white", className)}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => { playNext(track); toast.success("Playing next"); }}><ListStart /> Play next</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { addToQueue(track); toast.success("Added to Next up"); }}><ListEnd /> Add to Next up</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            if (user) useDialogs.getState().openAddToPlaylist(track);
            else useAuthPrompt.getState().show("Sign in to add tracks to playlists", () => useDialogs.getState().openAddToPlaylist(track));
          }}
        >
          <ListPlus /> Add to playlist
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            // RC-4: the seed plus 49 related tracks as a queue named "Station: <title>"; plays are counted as STATION.
            void vanillaApi.tracks.related.query({ trackId: track.id, limit: 49 }).then((related) => {
              usePlayerStore.getState().playContext([track, ...related], track, { name: `Station: ${track.title}`, source: "STATION" });
            }).catch(() => toast.error("Could not start the station"));
          }}
        >
          <Radio /> Start station
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {path ? <DropdownMenuItem asChild><Link href={path}><ExternalLink /> Go to track</Link></DropdownMenuItem> : null}
        {path ? <DropdownMenuItem onSelect={() => copyText(absoluteUrl(path))}><Link2 /> Copy link</DropdownMenuItem> : null}
        {path ? (
          <DropdownMenuItem onSelect={() => useDialogs.getState().openShare({ kind: "track", id: track.id, title: track.title, path, isPrivate: track.isPrivate, embeddable: track.embeddable, secret: new URLSearchParams(track.accessQuery).get("s") })}>
            <Share2 /> Share
          </DropdownMenuItem>
        ) : null}
        {download ? (
          <DropdownMenuItem
            onSelect={() => {
              if (!user) useAuthPrompt.getState().show("Sign in to download tracks");
              else {
                const link = document.createElement("a");
                link.href = `/api/tracks/${track.id}/download${track.accessQuery ? `?${track.accessQuery}` : ""}`;
                link.click();
              }
            }}
          >
            <Download /> Download
          </DropdownMenuItem>
        ) : null}
        {isOwner ? <DropdownMenuItem asChild><Link href={`/studio/tracks/${track.id}/edit`}><Pencil /> Edit</Link></DropdownMenuItem> : null}
        {!isOwner ? <DropdownMenuItem onSelect={() => startReport(!!user, { targetType: "TRACK", targetId: track.id, label: track.title })}><Flag /> Report</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
