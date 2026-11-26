"use client";

import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function copyText(text: string, message = "Link copied") {
  void navigator.clipboard.writeText(text).then(() => toast.success(message), () => toast.error("Could not copy"));
}

/** The secret link of a private track or collection, with copy and reset (IA-5, TR-2). */
export function SecretLinkBox({ path, token, onReset, resetting }: { path: string; token: string; onReset: () => void; resetting?: boolean }) {
  const link = typeof window === "undefined" ? `${path}/s-${token}` : new URL(`${path}/s-${token}`, window.location.origin).toString();
  return (
    <div className="space-y-2 rounded border border-zinc-800 p-3">
      <p className="text-sm font-medium">Secret link</p>
      <p className="text-xs text-zinc-400">Anyone with this link can listen, even while the item is private.</p>
      <input readOnly value={link} aria-label="Secret link" onFocus={(e) => e.currentTarget.select()} className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200" />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => copyText(link, "Secret link copied")} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">
          <Copy className="h-3.5 w-3.5" /> Copy secret link
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={resetting}
          onClick={() => { if (window.confirm("Reset the secret link? The old link stops working immediately.")) onReset(); }}
          className="text-zinc-300 hover:bg-zinc-800"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reset secret link
        </Button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  onConfirm,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild><div className="text-sm text-zinc-400">{children}</div></DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} className="text-zinc-300 hover:bg-zinc-800">Cancel</Button>
          <Button type="button" disabled={busy} onClick={onConfirm} className="bg-red-600 text-white hover:bg-red-700">{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
