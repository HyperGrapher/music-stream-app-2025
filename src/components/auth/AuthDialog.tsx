"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthPrompt } from "@/store/authPrompt";

import { AuthForm } from "./AuthForm";

/** Sign-in / sign-up modal opened by `useAuthPrompt().show(...)` from any "Sign in to ..." prompt (AU-2). */
export function AuthDialog() {
  const { open, mode, reason, setMode, close, succeeded } = useAuthPrompt();
  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{reason ?? (mode === "signin" ? "Sign in" : "Create your account")}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {mode === "signin" ? "Sign in to continue." : "Create a free account to continue."}
          </DialogDescription>
        </DialogHeader>
        <AuthForm mode={mode} onSuccess={succeeded} onSwitch={() => setMode(mode === "signin" ? "signup" : "signin")} />
      </DialogContent>
    </Dialog>
  );
}
