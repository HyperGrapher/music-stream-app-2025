"use client";

import { PlayerController } from "@/store/player";
import { useUser } from "@/hooks/useUser";

interface PlayerControllerWrapperProps {
  initialUserId?: string | null;
}

export function PlayerControllerWrapper({ initialUserId }: PlayerControllerWrapperProps = {}) {
  const { user } = useUser();
  
  // Use the user ID from the store, or fall back to the server-provided ID
  const userId = user?.id || (initialUserId || undefined);

  return <PlayerController userId={userId} />;
} 