"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDialogs } from "@/store/dialogs";
import { SHORTCUTS } from "@/store/player";

export function ShortcutsDialog() {
  const open = useDialogs((s) => s.shortcutsOpen);
  const set = useDialogs((s) => s.setShortcutsOpen);
  return (
    <Dialog open={open} onOpenChange={set}>
      <DialogContent>
        <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
        <dl className="space-y-2 text-sm">
          {[...SHORTCUTS, { keys: "L", action: "Like the current track" }].map((s) => (
            <div key={s.keys} className="flex justify-between gap-4"><dt className="text-zinc-300">{s.action}</dt><dd className="font-mono text-zinc-400">{s.keys}</dd></div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
