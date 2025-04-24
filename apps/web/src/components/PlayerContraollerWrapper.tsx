"use client";
import { PlayerController } from "@/store/player";
import { useUser } from "@/hooks/useUser";
// Client component to access user store
export function PlayerControllerWrapper() {
    const { user } = useUser();
    return <PlayerController userId={user?.id} />;
}
