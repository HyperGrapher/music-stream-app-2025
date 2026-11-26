"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { useUserStore } from "@/store/user";

type AuthProviderProps = {
  initialUser: {
    id: string;
    name?: string | null;
    username?: string | null;
    email?: string | null;
    image?: string | null;
    emailVerified?: boolean;
    onboardedAt?: Date | string | null;
  } | null;
};

export function AuthProvider({ initialUser }: AuthProviderProps) {
  const { setUser, setIsLoading } = useUserStore();
  const {
    data: session,
    isPending,
  } = authClient.useSession();

  // Update store based on server-provided initial user on first render
  useEffect(() => {
    if (initialUser) {
      setUser(initialUser);
      setIsLoading(false);
    }
  }, [initialUser, setUser, setIsLoading]);

  // Handle client-side auth state changes
  useEffect(() => {
    if (!isPending) {
      if (session) {
        // The server-resolved avatar wins over the OAuth image carried by the session.
        setUser({ ...session.user, image: initialUser?.image ?? session.user.image });
      } else if (!initialUser) {
        // Only set to null if we don't have an initialUser
        // This prevents flashing before session is loaded
        setUser(null);
      }
      setIsLoading(false);
    }
  }, [session, isPending, initialUser, setUser, setIsLoading]);

  return null;
} 