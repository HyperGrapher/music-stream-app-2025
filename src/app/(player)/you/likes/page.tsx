import type { PlayerTrack } from "@/types/player-track";
import { getSessionUser } from "@/server/session-user";
import { api } from "@/trpc/server";

import { ProfileList } from "../../[username]/ProfileList";
import { LikesActions } from "../LikesActions";

export default async function Page() {
  const user = (await getSessionUser())!;
  const initial = await api.profiles.tabPage({ username: user.username, tab: "likes" });
  const tracks = initial.items.flatMap((item) => ("kind" in item && item.kind === "track" ? [item.track as PlayerTrack] : []));
  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Likes</h1>
      <LikesActions tracks={tracks} />
      <ProfileList username={user.username} tab="likes" initial={initial} empty="Tracks and albums you like show up here." />
    </>
  );
}
