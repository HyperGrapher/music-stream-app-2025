import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function ProfileRedirectPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/");

  redirect(`/${session.user.username as string}`);
}
