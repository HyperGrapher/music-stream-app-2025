/** The sentence of one grouped notification, shared by the UI and the emails. */
export type NotificationType = "FOLLOW" | "TRACK_LIKE" | "COLLECTION_LIKE" | "TRACK_REPOST" | "COLLECTION_REPOST" | "COMMENT" | "REPLY" | "MENTION" | "COMMENT_LIKE" | "PLAYLIST_ADD" | "NEW_RELEASE" | "SYSTEM";

export const VERB: Record<NotificationType, string> = {
  FOLLOW: "started following you",
  TRACK_LIKE: "liked",
  COLLECTION_LIKE: "liked",
  TRACK_REPOST: "reposted",
  COLLECTION_REPOST: "reposted",
  COMMENT: "commented on",
  REPLY: "replied to your comment on",
  MENTION: "mentioned you on",
  COMMENT_LIKE: "liked your comment on",
  PLAYLIST_ADD: "added your track to a playlist:",
  NEW_RELEASE: "released",
  SYSTEM: "",
};

/** "Ana, Bo and 12 others liked Blue Hour": the sentence of one grouped notification, shared by the UI and emails. */
export function describeNotification(item: { type: NotificationType; actors: { name: string }[]; actorCount: number; message: string | null; target: { title: string } | null }) {
  if (item.type === "SYSTEM") return item.message ?? "Update from Music Stream";
  const names = item.actors.map((a) => a.name);
  const others = item.actorCount - names.length;
  const who = names.length === 0 ? "Someone" : others > 0 ? `${names.join(", ")} and ${others} ${others === 1 ? "other" : "others"}` : names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]!;
  return `${who} ${VERB[item.type]}${item.target ? ` ${item.target.title}` : ""}`.trim();
}

