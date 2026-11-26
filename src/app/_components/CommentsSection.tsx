"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Play } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePlayAt } from "@/hooks/usePlayAt";
import { useUser } from "@/hooks/useUser";
import { parseAccessQuery } from "@/lib/access-client";
import { friendlyError } from "@/lib/error-messages";
import { useAuthPrompt } from "@/store/authPrompt";
import { formatDuration } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { api, type RouterOutputs } from "@/trpc/react";
import type { PlayerTrack } from "@/types/player-track";

type Thread = RouterOutputs["comments"]["list"]["comments"][number];
type Comment = Thread | Thread["replies"][number];

const MAX_LENGTH = 1000;
const smallButton = "text-xs font-semibold text-zinc-400 transition hover:text-white";

function TimeChip({ seconds, onClick }: { seconds: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Play from ${formatDuration(seconds)}`}
      className="inline-flex items-center gap-1 rounded bg-orange-500/15 px-1.5 py-0.5 text-xs font-semibold text-orange-400 transition hover:bg-orange-500/25"
    >
      <Play className="h-2.5 w-2.5 fill-current" />
      {formatDuration(seconds)}
    </button>
  );
}

function Composer({
  track,
  parentId,
  autoFocus = false,
  onDone,
}: {
  track: PlayerTrack;
  parentId?: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const { user } = useUser();
  const utils = api.useUtils();
  const [text, setText] = useState("");
  const [attachTime, setAttachTime] = useState(true);
  // Live position, only meaningful while this track is the one loaded in the player.
  const { isCurrent, currentTime } = usePlayerStore(
    useShallow((state) => ({
      isCurrent: state.currentTrack?.id === track.id,
      currentTime: state.currentTime,
    })),
  );

  const create = api.comments.create.useMutation({
    onSuccess: async () => {
      setText("");
      onDone?.();
      await utils.comments.list.invalidate({ trackId: track.id });
    },
    onError: (error) => toast.error(friendlyError(error, "Could not post your comment")),
  });

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => useAuthPrompt.getState().show("Sign in to comment")}
        className="w-full rounded border border-dashed border-zinc-700 p-4 text-left text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
      >
        Sign in to join the conversation.
      </button>
    );
  }

  const canAttach = !parentId && isCurrent;
  const submit = () => {
    const content = text.trim();
    if (!content || create.isPending) return;
    // Read the player at the moment of posting, not when the user started typing.
    const player = usePlayerStore.getState();
    const timed = !parentId && attachTime && player.currentTrack?.id === track.id;
    create.mutate({
      trackId: track.id,
      access: parseAccessQuery(track.accessQuery),
      content,
      ...(parentId ? { parentId } : {}),
      ...(timed ? { timestampSeconds: Math.floor(player.currentTime) } : {}),
    });
  };

  return (
    <form
      className="flex gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Avatar className="mt-1 h-9 w-9 shrink-0">
        <AvatarImage src={user.image ?? ""} alt="" />
        <AvatarFallback>{user.name?.charAt(0) ?? "U"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
          }}
          autoFocus={autoFocus}
          maxLength={MAX_LENGTH}
          rows={parentId ? 2 : 3}
          aria-label={parentId ? "Write a reply" : "Write a comment"}
          placeholder={parentId ? "Write a reply…" : "Write a comment…"}
          className="w-full resize-y rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">
            {parentId ? null : canAttach ? (
              <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-300">
                <input
                  type="checkbox"
                  checked={attachTime}
                  onChange={(event) => setAttachTime(event.target.checked)}
                  className="accent-orange-500"
                />
                Comment at <strong className="text-orange-400">{formatDuration(Math.floor(currentTime))}</strong>
              </label>
            ) : (
              "Play the track to attach a moment to your comment."
            )}
          </div>
          <div className="flex items-center gap-3">
            {text.length > MAX_LENGTH - 200 && (
              <span className="text-xs text-zinc-500">{MAX_LENGTH - text.length} left</span>
            )}
            {onDone && (
              <button type="button" onClick={onDone} className={smallButton}>
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!text.trim() || create.isPending}
              className="rounded-full bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:opacity-40"
            >
              {parentId ? "Reply" : "Post"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function CommentRow({
  comment,
  track,
  onReply,
  onDelete,
}: {
  comment: Comment;
  track: PlayerTrack;
  onReply?: () => void;
  onDelete: () => void;
}) {
  const playAt = usePlayAt(track);
  return (
    <article className="flex gap-3" data-testid="comment">
      <Link href={`/${comment.author.username}`} className="shrink-0">
        <Avatar className="h-9 w-9">
          <AvatarImage src={comment.author.image ?? ""} alt="" />
          <AvatarFallback>{comment.author.name.charAt(0)}</AvatarFallback>
        </Avatar>
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Link href={`/${comment.author.username}`} className="font-semibold hover:text-orange-400">
            {comment.author.name}
          </Link>
          {"isCreator" in comment && comment.isCreator && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-zinc-300 uppercase">
              Creator
            </span>
          )}
          {comment.timestampSeconds !== null && (
            <>
              <span className="text-zinc-600">at</span>
              <TimeChip seconds={comment.timestampSeconds} onClick={() => playAt(comment.timestampSeconds!)} />
            </>
          )}
          <span className="text-xs text-zinc-500">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 break-words whitespace-pre-line text-zinc-200">
          {comment.content}
        </p>
        <div className="mt-1 flex gap-4">
          {onReply && (
            <button type="button" onClick={onReply} className={smallButton}>
              Reply
            </button>
          )}
          {comment.canDelete && (
            <button type="button" onClick={onDelete} className={smallButton}>
              Delete
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function ThreadView({ thread, track }: { thread: Thread; track: PlayerTrack }) {
  const utils = api.useUtils();
  const [replying, setReplying] = useState(false);
  const remove = api.comments.delete.useMutation({
    onSuccess: () => utils.comments.list.invalidate({ trackId: track.id }),
    onError: (error) => toast.error(error.message || "Could not delete the comment"),
  });
  const confirmDelete = (comment: Comment, warnReplies: boolean) => {
    const message = warnReplies && thread.replies.length ? "Delete this comment and its replies?" : "Delete this comment?";
    if (window.confirm(message)) remove.mutate({ commentId: comment.id });
  };

  return (
    <li className="space-y-4">
      <CommentRow
        comment={thread}
        track={track}
        onReply={() => setReplying(true)}
        onDelete={() => confirmDelete(thread, true)}
      />
      {(thread.replies.length > 0 || replying) && (
        <div className="ml-12 space-y-4 border-l border-zinc-800 pl-4">
          {thread.replies.map((reply) => (
            <CommentRow
              key={reply.id}
              comment={reply}
              track={track}
              onDelete={() => confirmDelete(reply, false)}
            />
          ))}
          {replying && (
            <Composer track={track} parentId={thread.id} autoFocus onDone={() => setReplying(false)} />
          )}
        </div>
      )}
    </li>
  );
}

export function CommentsSection({ track }: { track: PlayerTrack }) {
  const { data } = api.comments.list.useQuery({
    trackId: track.id,
    access: parseAccessQuery(track.accessQuery),
  });
  const threads = data?.comments ?? [];
  const commentsEnabled = data?.commentsEnabled ?? true;

  return (
    <section aria-labelledby="comments-heading">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <h2 id="comments-heading" className="text-xs font-bold tracking-wide uppercase">
          {data?.total ?? 0} {data?.total === 1 ? "comment" : "comments"}
        </h2>
        <span className="text-xs text-zinc-500">Newest</span>
      </div>

      <div className="mt-4">
        {commentsEnabled ? (
          <Composer track={track} />
        ) : (
          <p className="rounded border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
            Comments are turned off for this track.
          </p>
        )}
      </div>

      {threads.length === 0 ? (
        <div className="mt-6 flex items-center gap-4 rounded border border-dashed border-zinc-700 p-5">
          <MessageCircle className="h-6 w-6 shrink-0 text-zinc-500" />
          <div>
            <p className="font-semibold">Be the first to comment on this track.</p>
            <p className="mt-1 text-sm text-zinc-500">
              Start a conversation at a specific moment in the waveform.
            </p>
          </div>
        </div>
      ) : (
        <ul className="mt-6 space-y-6">
          {threads.map((thread) => (
            <ThreadView key={thread.id} thread={thread} track={track} />
          ))}
        </ul>
      )}
    </section>
  );
}
