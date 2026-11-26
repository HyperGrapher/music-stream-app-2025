import type { Metadata } from "next";

import { api } from "@/trpc/server";

import { ProfileList } from "../ProfileList";
import { ProfileShell, profileMetadata } from "../ProfileShell";

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return profileMetadata((await params).username, "Tracks");
}

export default async function Page({ params }: { params: Params }) {
  const { username } = await params;
  const initial = await api.profiles.tabPage({ username, tab: "tracks" });
  return (
    <ProfileShell username={username} active="tracks">
      <ProfileList username={username} tab="tracks" initial={initial} empty="No public tracks yet." />
    </ProfileShell>
  );
}
