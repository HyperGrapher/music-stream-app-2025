import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Navbar } from "./Navbar";

export async function ServerNavbar() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    return <Navbar initialUser={session?.user || null} />;
} 