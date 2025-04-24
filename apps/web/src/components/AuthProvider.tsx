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
        data: session, // session and user data
        isPending, //loading state
        error, //error object
        refetch //refetch the session
    } = authClient.useSession();


  useEffect(() => {
    // Initialize with server-provided user data
    if (initialUser) {
      setUser(initialUser);
      setIsLoading(false);
    }

    // Subscribe to auth changes
    // const unsubscribe = authClient.onAuthStateChange((session) => {
    //   if (session) {
    //     setUser(session.user);
    //   } else {
    //     setUser(null);
    //   }
    //   setIsLoading(false);
    // });



    return () => {
    //   unsubscribe();
    };
  }, [initialUser, setUser, setIsLoading]);

  return null;
} 