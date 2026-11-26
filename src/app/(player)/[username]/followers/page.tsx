import type { Metadata } from "next";

import { api } from "@/trpc/server";

import { ProfileShell, profileMetadata } from "../ProfileShell";
import { UserList } from "../UserList";

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return profileMetadata((await params).username, "Followers");
}

export default async function Page({ params }: { params: Params }) {
  const { username } = await params;
  const initial = await api.profiles.follows({ username, direction: "followers" });
  return (
    <ProfileShell username={username} active="followers">
      <UserList username={username} direction="followers" initial={initial} />
    </ProfileShell>
  );
}
