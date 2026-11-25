"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { useUserStore } from "@/store/user";

type AuthProviderProps = {
  initialUser: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
};

export function AuthProvider({ initialUser }: AuthProviderProps) {
  const { setUser, setIsLoading } = useUserStore();
  const {
    data: session,
    isPending,
    error
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
        setUser(session.user);
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