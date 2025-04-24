"use client";

import { PlayerController } from "@/store/player";
import { useUser } from "@/hooks/useUser";
import { useEffect } from "react";
import { useUserStore } from "@/store/user";

interface PlayerControllerWrapperProps {
  initialUserId?: string | null;
}

export function PlayerControllerWrapper({ initialUserId }: PlayerControllerWrapperProps = {}) {
  const { user } = useUser();
  const { setUser } = useUserStore();
  
  // Use the user ID from the store, or fall back to the server-provided ID
  const userId = user?.id || (initialUserId || undefined);
  
  // If we have an initial user ID but no user in the store, create a minimal user object
  useEffect(() => {
    if (initialUserId && !user) {
      setUser({ id: initialUserId });
    }
  }, [initialUserId, user, setUser]);

  return <PlayerController userId={userId} />;
} 