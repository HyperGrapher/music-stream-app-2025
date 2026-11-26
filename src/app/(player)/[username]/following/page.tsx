import type { Metadata } from "next";

import { api } from "@/trpc/server";

import { ProfileShell, profileMetadata } from "../ProfileShell";
import { UserList } from "../UserList";

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return profileMetadata((await params).username, "Following");
}

export default async function Page({ params }: { params: Params }) {
  const { username } = await params;
  const initial = await api.profiles.follows({ username, direction: "following" });
  return (
    <ProfileShell username={username} active="following">
      <UserList username={username} direction="following" initial={initial} />
    </ProfileShell>
  );
}
