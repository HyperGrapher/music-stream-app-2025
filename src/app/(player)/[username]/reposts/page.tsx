import type { Metadata } from "next";

import { api } from "@/trpc/server";

import { ProfileList } from "../ProfileList";
import { ProfileShell, profileMetadata } from "../ProfileShell";

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return profileMetadata((await params).username, "Reposts");
}

export default async function Page({ params }: { params: Params }) {
  const { username } = await params;
  const initial = await api.profiles.tabPage({ username, tab: "reposts" });
  return (
    <ProfileShell username={username} active="reposts">
      <ProfileList username={username} tab="reposts" initial={initial} empty="No reposts yet." />
    </ProfileShell>
  );
}
