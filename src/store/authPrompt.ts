import { create } from "zustand";

/**
 * Sign-in modal state (PRD AU-2). `requireAuth(reason, action)` opens the modal when nobody is
 * signed in and runs `action` exactly once after a successful sign-in/up, so the like or follow
 * the visitor clicked is not lost.
 */
interface AuthPromptState {
  open: boolean;
  mode: "signin" | "signup";
  reason: string | null;
  pending: (() => void) | null;
  show: (reason: string, pending?: () => void, mode?: "signin" | "signup") => void;
  setMode: (mode: "signin" | "signup") => void;
  close: () => void;
  /** Called by the form after success: closes the modal and retries the pending action once. */
  succeeded: () => void;
}

export const useAuthPrompt = create<AuthPromptState>((set, get) => ({
  open: false,
  mode: "signin",
  reason: null,
  pending: null,
  show: (reason, pending, mode = "signin") => set({ open: true, reason, pending: pending ?? null, mode }),
  setMode: (mode) => set({ mode }),
  close: () => set({ open: false, pending: null, reason: null }),
  succeeded: () => {
    const { pending } = get();
    set({ open: false, pending: null, reason: null });
    // After the session cookie has been picked up by the page.
    if (pending) setTimeout(pending, 300);
  },
}));
