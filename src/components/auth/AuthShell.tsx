import type { ReactNode } from "react";

/** Centered card used by every full-page auth screen. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12 text-white">
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-zinc-400">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}
