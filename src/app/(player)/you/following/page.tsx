import { requireUser } from "../requireUser";
import { api } from "@/trpc/server";

import { UserList } from "../../[username]/UserList";

export default async function Page() {
  const user = await requireUser("/you/following");
  const initial = await api.profiles.follows({ username: user.username, direction: "following" });
  return (<><h1 className="mb-4 text-xl font-bold">Following</h1><UserList username={user.username} direction="following" initial={initial} /></>);
}
