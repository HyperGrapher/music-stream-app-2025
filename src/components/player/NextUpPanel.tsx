"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { playOrder } from "@/lib/player-queue";
import { formatDuration } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import type { PlayerTrack } from "@/types/player-track";

const UPCOMING_LIMIT = 100;

function Row({ track, children, onPlay }: { track: PlayerTrack; children?: React.ReactNode; onPlay: () => void }) {
  return (
    <li className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-800">
      <button type="button" onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={`Play ${track.title}`}>
        <img src={track.artworkUrl ?? "/placeholder-track.jpg"} alt="" className="h-9 w-9 shrink-0 rounded-sm object-cover" />
        <span className="min-w-0">
          <span className="block truncate text-sm text-white">{track.title}</span>
          <span className="block truncate text-xs text-zinc-400">{track.artistName ?? track.user?.name}</span>
        </span>
      </button>
      <span className="text-xs tabular-nums text-zinc-500">{formatDuration(track.duration)}</span>
      {children}
    </li>
  );
}

/** The queue (PRD PL-P2): what is playing, the user's "Next up", the rest of the context, and recent history. */
export function NextUpPanel() {
  const s = usePlayerStore(
    useShallow((state) => ({
      open: state.nextUpOpen,
      currentTrack: state.currentTrack,
      userQueue: state.userQueue,
      playlist: state.playlist,
      order: state.order,
      cursorId: state.cursorId,
      contextName: state.contextName,
      history: state.history,
      autoplay: state.autoplay,
      removeFromQueue: state.removeFromQueue,
      moveInQueue: state.moveInQueue,
      clearQueue: state.clearQueue,
      playFromQueue: state.playFromQueue,
      playTrack: state.playTrack,
      setNextUpOpen: state.setNextUpOpen,
      toggleAutoplay: state.toggleAutoplay,
    })),
  );
  if (!s.open) return null;

  const list = playOrder({ context: s.playlist, order: s.order });
  const at = list.findIndex((t) => t.id === (s.cursorId ?? s.currentTrack?.id));
  const upcoming = list.slice(at + 1, at + 1 + UPCOMING_LIMIT);

  return (
    <aside aria-label="Next up" className="fixed right-2 bottom-[77px] z-40 flex max-h-[70vh] w-[min(24rem,calc(100vw-1rem))] flex-col rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <h2 className="text-sm font-semibold text-white">Next up</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
            <input type="checkbox" checked={s.autoplay} onChange={s.toggleAutoplay} /> Autoplay
          </label>
          <button type="button" aria-label="Close" onClick={() => s.setNextUpOpen(false)} className="text-zinc-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      </header>
      <div className="overflow-y-auto p-2">
        {s.currentTrack ? (
          <section>
            <h3 className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Now playing</h3>
            <ul><Row track={s.currentTrack} onPlay={() => undefined} /></ul>
          </section>
        ) : null}
        <section className="mt-2">
          <div className="flex items-center justify-between px-2 pb-1">
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Next up</h3>
            {s.userQueue.length > 0 ? <button type="button" onClick={s.clearQueue} className="text-xs text-zinc-400 hover:text-white">Clear</button> : null}
          </div>
          {s.userQueue.length === 0 ? <p className="px-2 pb-1 text-xs text-zinc-500">Nothing queued. Use “Play next” or “Add to Next up” on any track.</p> : null}
          <ul>
            {s.userQueue.map((track, index) => (
              <Row key={track.id} track={track} onPlay={() => s.playFromQueue(track.id)}>
                <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <button type="button" aria-label={`Move ${track.title} up`} disabled={index === 0} onClick={() => s.moveInQueue(index, index - 1)} className="p-1 text-zinc-400 hover:text-white disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={`Move ${track.title} down`} disabled={index === s.userQueue.length - 1} onClick={() => s.moveInQueue(index, index + 1)} className="p-1 text-zinc-400 hover:text-white disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={`Remove ${track.title}`} onClick={() => s.removeFromQueue(track.id)} className="p-1 text-zinc-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                </span>
              </Row>
            ))}
          </ul>
        </section>
        {upcoming.length > 0 ? (
          <section className="mt-2">
            <h3 className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Next from: {s.contextName ?? "this list"}</h3>
            <ul>{upcoming.map((track) => <Row key={track.id} track={track} onPlay={() => s.playTrack(track)} />)}</ul>
          </section>
        ) : null}
        {s.history.length > 0 ? (
          <section className="mt-2">
            <h3 className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">History</h3>
            <ul>{[...s.history].reverse().slice(0, 20).map((track) => <Row key={track.id} track={track} onPlay={() => s.playTrack(track)} />)}</ul>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
