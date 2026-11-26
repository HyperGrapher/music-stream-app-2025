"use client";

import { Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTimeFragment } from "@/lib/time-fragment";
import { formatDuration } from "@/lib/utils";
import { type ShareTarget, useDialogs } from "@/store/dialogs";

import { copyText } from "./TrackMenu";

/** The iframe snippet of the Embed tab. */
export function embedCode(target: Pick<ShareTarget, "kind" | "id" | "secret">, origin: string) {
  const path = `/embed/${target.kind}/${target.id}${target.secret ? `?s=${target.secret}` : ""}`;
  const height = target.kind === "track" ? 140 : 360;
  return `<iframe title="Player" width="100%" height="${height}" style="border:0" allow="autoplay" src="${origin}${path}"></iframe>`;
}

function Body({ target }: { target: ShareTarget }) {
  const [atTime, setAtTime] = useState(false);
  const hasTime = target.kind === "track" && (target.atSeconds ?? 0) >= 1;
  const url = new URL(target.path, window.location.origin).toString() + (atTime && hasTime ? `#t=${formatTimeFragment(target.atSeconds!)}` : "");
  const enc = encodeURIComponent;
  const social = target.isPrivate
    ? []
    : [
        ["X", `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(target.title)}`],
        ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
        ["WhatsApp", `https://wa.me/?text=${enc(`${target.title} ${url}`)}`],
        ["Email", `mailto:?subject=${enc(target.title)}&body=${enc(url)}`],
      ];
  const canEmbed = target.embeddable !== false && (!target.isPrivate || !!target.secret);

  return (
    <Tabs defaultValue="share">
      <TabsList>
        <TabsTrigger value="share">Share</TabsTrigger>
        {canEmbed ? <TabsTrigger value="embed">Embed</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="share" className="space-y-3">
        {target.isPrivate ? <p className="text-sm text-amber-300">This is private. Anyone with this link can listen.</p> : null}
        <div className="flex gap-2">
          <Input readOnly aria-label="Link" value={url} onFocus={(e) => e.currentTarget.select()} />
          <Button type="button" onClick={() => copyText(url)}><Copy className="h-4 w-4" /> Copy</Button>
        </div>
        {hasTime ? (
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={atTime} onChange={(e) => setAtTime(e.target.checked)} /> At {formatDuration(target.atSeconds!)}
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {social.map(([name, href]) => (
            <Button key={name} asChild variant="outline" size="sm"><a href={href} target="_blank" rel="noopener noreferrer">{name}</a></Button>
          ))}
          {typeof navigator !== "undefined" && "share" in navigator ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void navigator.share({ title: target.title, url }).catch(() => undefined)}>More…</Button>
          ) : null}
        </div>
      </TabsContent>
      {canEmbed ? (
        <TabsContent value="embed" className="space-y-3">
          <textarea readOnly aria-label="Embed code" rows={4} className="w-full rounded-md border border-zinc-700 bg-zinc-900 p-2 font-mono text-xs" value={embedCode(target, window.location.origin)} onFocus={(e) => e.currentTarget.select()} />
          <Button type="button" onClick={() => copyText(embedCode(target, window.location.origin), "Embed code copied")}><Copy className="h-4 w-4" /> Copy code</Button>
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

export function ShareDialog() {
  const target = useDialogs((s) => s.share);
  const close = useDialogs((s) => s.close);
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription className="truncate">{target?.title}</DialogDescription>
        </DialogHeader>
        {target ? <Body key={target.id} target={target} /> : null}
      </DialogContent>
    </Dialog>
  );
}
