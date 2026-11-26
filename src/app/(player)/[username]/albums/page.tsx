import type { Metadata } from "next";

import { api } from "@/trpc/server";

import { ProfileList } from "../ProfileList";
import { ProfileShell, profileMetadata } from "../ProfileShell";

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return profileMetadata((await params).username, "Albums");
}

export default async function Page({ params }: { params: Params }) {
  const { username } = await params;
  const initial = await api.profiles.tabPage({ username, tab: "albums" });
  return (
    <ProfileShell username={username} active="albums">
      <ProfileList username={username} tab="albums" initial={initial} empty="No public albums or EPs yet." />
    </ProfileShell>
  );
}
