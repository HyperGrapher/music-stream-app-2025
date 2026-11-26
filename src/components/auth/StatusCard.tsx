import { MailCheck, MailWarning, Mail } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TONES = {
  success: { icon: MailCheck, ring: "bg-emerald-500/15 text-emerald-400" },
  info: { icon: Mail, ring: "bg-orange-500/15 text-orange-400" },
  error: { icon: MailWarning, ring: "bg-red-500/15 text-red-400" },
} as const;

/** Centered card with an icon, used for one-message auth outcomes (email verified, check your inbox, bad link). */
export function StatusCard({ tone, title, subtitle, children }: { tone: keyof typeof TONES; title: string; subtitle?: string; children?: ReactNode }) {
  const { icon: Icon, ring } = TONES[tone];
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center px-4 py-12 text-white">
      <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center shadow-xl shadow-black/30">
        <div className={cn("mx-auto flex h-16 w-16 items-center justify-center rounded-full", ring)}>
          <Icon className="h-8 w-8" aria-hidden />
        </div>
        <h1 className="mt-5 text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-zinc-400">{subtitle}</p>}
        {children ? <div className="mt-6 flex justify-center text-sm">{children}</div> : null}
      </div>
    </div>
  );
}
