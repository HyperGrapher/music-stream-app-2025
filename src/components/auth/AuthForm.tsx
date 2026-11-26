"use client";

import { hardNavigate } from "@/lib/navigate";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_PROBLEM_MESSAGES, passwordProblem } from "@/lib/passwords";
import { safeNextPath } from "@/lib/safe-redirect";

interface AuthFormProps {
  mode: "signin" | "signup";
  /** Where to go after success (page use); the modal passes `onSuccess` instead. */
  next?: string;
  onSuccess?: () => void;
  /** Switch between the two forms (modal) instead of navigating. */
  onSwitch?: () => void;
}

export function GoogleButton({ next = "/", label }: { next?: string; label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full border-zinc-700 bg-transparent text-white hover:bg-zinc-800"
      onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: safeNextPath(next) })}
    >
      {label}
    </Button>
  );
}

const field = "border-zinc-700 bg-zinc-900 text-white";

/** Email + password sign in / sign up (AU-1, AU-3). Used by the full pages and by the modal. */
export function AuthForm({ mode, next = "/", onSuccess, onSwitch }: AuthFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = safeNextPath(next);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === "signup") {
      const problem = passwordProblem(password, { email });
      if (problem) return setError(PASSWORD_PROBLEM_MESSAGES[problem]);
    }
    setBusy(true);
    const result =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name: name.trim() || email.split("@")[0]!, callbackURL: "/verify-email?status=success" })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (result.error) {
      if (/suspended/i.test(result.error.message ?? "")) return hardNavigate("/suspended");
      setError(result.error.message ?? "Something went wrong. Try again.");
      return;
    }
    if (onSuccess) onSuccess();
    // A full navigation so server components see the new session.
    else hardNavigate(mode === "signup" ? "/onboarding" : target);
  };

  const other = mode === "signin" ? "signup" : "signin";
  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4" aria-label={mode === "signin" ? "Sign in" : "Create account"}>
      <GoogleButton next={mode === "signup" ? "/onboarding" : target} label="Continue with Google" />
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span className="h-px flex-1 bg-zinc-800" /> or <span className="h-px flex-1 bg-zinc-800" />
      </div>
      {mode === "signup" && (
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Display name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoComplete="name" className={field} />
        </label>
      )}
      <label className="block text-sm">
        <span className="mb-1 block text-zinc-300">Email</span>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={field} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-zinc-300">Password</span>
        <span className="relative block">
          <Input
            type={show ? "text" : "password"}
            required
            minLength={mode === "signup" ? 8 : 1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className={`${field} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-1 -translate-y-1/2 p-2 text-zinc-400 hover:text-white"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
      </label>
      {mode === "signin" && (
        <Link href="/forgot-password" className="block text-xs text-zinc-400 hover:text-orange-400">
          Forgot your password?
        </Link>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full bg-orange-700 text-white hover:bg-orange-800">
        {busy ? "One moment..." : mode === "signin" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-sm text-zinc-400">
        {mode === "signin" ? "New here? " : "Already have an account? "}
        {onSwitch ? (
          <button type="button" onClick={onSwitch} className="font-semibold text-orange-400 hover:underline">
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        ) : (
          <Link href={`/${other}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-orange-400 hover:underline">
            {mode === "signin" ? "Create an account" : "Sign in"}
          </Link>
        )}
      </p>
    </form>
  );
}
