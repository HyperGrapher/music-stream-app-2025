import { useUserStore } from "@/store/user";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";

export type AuthError = {
    status: number;
    message: string;
};

export function useUser() {
    const { user, isLoading } = useUserStore();
    const [authError, setAuthError] = useState<AuthError | null>(null);

    const clearError = () => setAuthError(null);

    const signOut = async () => {
        try {
            await authClient.signOut();
        } catch (error) {
            console.error("Sign out error:", error);
        }
    };

    const signIn = {
        email: async (data: { email: string; password: string }, options?: { onSuccess?: () => void, onError?: (error: AuthError) => void }) => {
            clearError();
            try {
                const result = await authClient.signIn.email(data, {
                    onError: (ctx) => {
                        const error = {
                            status: ctx.error.status,
                            message: ctx.error.message
                        };
                        setAuthError(error);
                        options?.onError?.(error);
                    }
                });
                options?.onSuccess?.();
                return result;
            } catch (error) {
                console.error("Email sign in error:", error);
            }
        },
        google: async (options?: { onSuccess?: () => void, onError?: (error: AuthError) => void }) => {
            clearError();
            try {
                const result = await authClient.signIn.social({
                    provider: "google"
                });
                options?.onSuccess?.();
                return result;
            } catch (error) {
                console.error("Google sign in error:", error);
                const authError = {
                    status: 500,
                    message: "Failed to sign in with Google"
                };
                setAuthError(authError);
                options?.onError?.(authError);
            }
        }
    };

    const signUp = {
        email: async (data: { email: string; password: string; name: string }, options?: { onSuccess?: () => void, onError?: (error: AuthError) => void }) => {
            clearError();
            try {
                const result = await authClient.signUp.email(data, {
                    onError: (ctx) => {
                        const error = {
                            status: ctx.error.status,
                            message: ctx.error.message
                        };
                        setAuthError(error);
                        options?.onError?.(error);
                    }
                });
                options?.onSuccess?.();
                return result;
            } catch (error) {
                console.error("Email sign up error:", error);
            }
        },
        google: async (options?: { onSuccess?: () => void, onError?: (error: AuthError) => void }) => {
            // Reuse the sign in with Google functionality for sign up
            return signIn.google(options);
        }
    };

    return {
        user,
        isLoading,
        isAuthenticated: !!user,
        authError,
        clearError,
        signOut,
        signIn,
        signUp
    };
} 