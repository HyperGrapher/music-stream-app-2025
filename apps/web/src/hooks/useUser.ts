import { useUserStore } from "@/store/user";

export function useUser() {
    const { user, isLoading } = useUserStore();

    return {
        user,
        isLoading,
        isAuthenticated: !!user,
    };
} 