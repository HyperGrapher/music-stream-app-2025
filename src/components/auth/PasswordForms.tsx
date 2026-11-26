"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_PROBLEM_MESSAGES, passwordProblem } from "@/lib/passwords";

const field = "border-zinc-700 bg-zinc-900 text-white";

/** AU-5: always answers the same, whether or not the address has an account. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (sent) {
    return (
      <p role="status" className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">
        If an account exists for that address, we sent a link to reset the password. It works for one hour.
      </p>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void authClient
          .requestPasswordReset({ email, redirectTo: "/reset-password" })
          .finally(() => {
            setBusy(false);
            setSent(true);
          });
      }}
    >
      <label className="block text-sm">
        <span className="mb-1 block text-zinc-300">Email</span>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={field} />
      </label>
      <Button type="submit" disabled={busy} className="w-full bg-orange-700 text-white hover:bg-orange-800">
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token, invalid }: { token?: string; invalid: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (invalid || !token) {
    return (
      <div className="space-y-3 text-sm text-zinc-300">
        <p role="alert">This reset link is invalid or has expired.</p>
        <Link href="/forgot-password" className="font-semibold text-orange-400 hover:underline">
          Ask for a new link
        </Link>
      </div>
    );
  }
  if (done) {
    return (
      <p role="status" className="text-sm text-zinc-300">
        Your password was changed and your other devices were signed out.{" "}
        <Link href="/signin" className="font-semibold text-orange-400 hover:underline">
          Sign in
        </Link>
      </p>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const problem = passwordProblem(password);
        if (problem) return setError(PASSWORD_PROBLEM_MESSAGES[problem]);
        void authClient.resetPassword({ newPassword: password, token }).then((result) => {
          if (result.error) setError(result.error.message ?? "Could not reset the password");
          else setDone(true);
        });
      }}
    >
      <label className="block text-sm">
        <span className="mb-1 block text-zinc-300">New password</span>
        <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={field} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full bg-orange-700 text-white hover:bg-orange-800">
        Change password
      </Button>
    </form>
  );
}

/** "Resend email" (AU-4). The server sends at most 3 per hour per address and says nothing more. */
export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  return (
    <button
      type="button"
      disabled={state !== "idle"}
      className="font-semibold underline disabled:no-underline disabled:opacity-70"
      onClick={() => {
        setState("sending");
        void authClient.sendVerificationEmail({ email, callbackURL: "/verify-email?status=success" }).finally(() => setState("sent"));
      }}
    >
      {state === "sent" ? "Email sent" : "Resend email"}
    </button>
  );
}
