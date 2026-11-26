import type { Metadata } from "next";

import { api } from "@/trpc/server";

import { ProfileList } from "../ProfileList";
import { ProfileShell, profileMetadata } from "../ProfileShell";

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return profileMetadata((await params).username, "Likes");
}

export default async function Page({ params }: { params: Params }) {
  const { username } = await params;
  const initial = await api.profiles.tabPage({ username, tab: "likes" });
  return (
    <ProfileShell username={username} active="likes">
      <ProfileList username={username} tab="likes" initial={initial} empty="No likes to show." />
    </ProfileShell>
  );
}
