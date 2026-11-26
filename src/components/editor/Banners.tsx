"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";

import { copyText } from "./shared";

interface Action { label: string; href?: string; onClick?: () => void }

/** Success banner after saving (PRD UP-10, UP-15): "Your track is live" and the next steps. */
export function PublishedBanner({
  kind,
  status,
  at,
  path,
  secretToken,
  actions,
}: {
  kind: "track" | "album" | "playlist";
  status: string;
  at?: string;
  path: string;
  secretToken?: string | null;
  actions: Action[];
}) {
  const noun = kind === "track" ? "track" : kind;
  const message =
    status === "private"
      ? `Your ${noun} is private: only people with the link can hear it.`
      : status === "scheduled" && at
        ? `Scheduled for ${format(new Date(at), "d MMM, HH:mm")}.`
        : `Your ${noun} is live.`;
  const link = status === "private" && secretToken ? `${path}/s-${secretToken}` : path;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-100" data-testid="published-banner">
      <strong className="mr-2 text-base">{message}</strong>
      <Button type="button" size="sm" variant="outline" onClick={() => copyText(new URL(link, window.location.origin).toString())} className="border-green-500/40 bg-transparent text-green-50 hover:bg-green-500/20">Copy link</Button>
      {actions.map((a) =>
        a.href ? (
          <Button key={a.label} asChild size="sm" variant="outline" className="border-green-500/40 bg-transparent text-green-50 hover:bg-green-500/20"><Link href={a.href}>{a.label}</Link></Button>
        ) : (
          <Button key={a.label} type="button" size="sm" variant="outline" onClick={a.onClick} className="border-green-500/40 bg-transparent text-green-50 hover:bg-green-500/20">{a.label}</Button>
        ),
      )}
    </div>
  );
}

/** TR-2: owner-only note on private or scheduled content, with a one-click secret link. */
export function OwnerVisibilityBanner({ visibility, publishAt, path, secretToken }: { visibility: "PRIVATE" | "SCHEDULED"; publishAt?: Date | string | null; path: string; secretToken: string }) {
  return (
    <p className="mb-4 flex flex-wrap items-center gap-3 rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <Lock className="h-4 w-4 shrink-0" />
      <span>
        {visibility === "SCHEDULED" && publishAt
          ? `Scheduled for ${format(new Date(publishAt), "d MMM yyyy, HH:mm")}. Only you and people with the secret link can listen until then.`
          : "Private: only you and people with the secret link can listen."}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={() => copyText(new URL(`${path}/s-${secretToken}`, window.location.origin).toString(), "Secret link copied")} className="border-amber-500/40 bg-transparent text-amber-100 hover:bg-amber-500/20">
        Copy secret link
      </Button>
    </p>
  );
}
