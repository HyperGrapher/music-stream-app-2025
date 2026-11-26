import { getSessionUser } from "@/server/session-user";

import { Navbar } from "./Navbar";

export async function ServerNavbar() {
  return <Navbar initialUser={await getSessionUser()} />;
}
