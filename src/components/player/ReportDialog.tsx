"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/error-messages";
import { useAuthPrompt } from "@/store/authPrompt";
import { type ReportTarget, useDialogs } from "@/store/dialogs";
import { api } from "@/trpc/react";

export const REPORT_REASON_OPTIONS = [
  ["COPYRIGHT", "Copyright infringement"], ["SPAM", "Spam or scam"], ["HARASSMENT", "Harassment or bullying"], ["HATE", "Hate speech"],
  ["SEXUAL", "Sexual content"], ["VIOLENCE", "Violence or dangerous content"], ["IMPERSONATION", "Impersonation"], ["OTHER", "Other"],
] as const;

function Form({ target, close }: { target: ReportTarget; close: () => void }) {
  const [reason, setReason] = useState<(typeof REPORT_REASON_OPTIONS)[number][0]>("SPAM");
  const [details, setDetails] = useState("");
  const [rights, setRights] = useState(false);
  const [original, setOriginal] = useState("");
  const [done, setDone] = useState(false);
  const report = api.trust.report.useMutation({
    onSuccess: () => setDone(true),
    onError: (error) => toast.error(friendlyError(error, "Could not send your report")),
  });
  if (done) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-200" role="status">Thanks — we&apos;ll review this.</p>
        <Button onClick={close}>Close</Button>
      </div>
    );
  }
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); report.mutate({ targetType: target.targetType, targetId: target.targetId, reason, details: details || undefined, rightsHolder: reason === "COPYRIGHT" ? rights : undefined, originalUrl: reason === "COPYRIGHT" && original ? original : undefined }); }}>
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-medium">Why are you reporting this?</legend>
        {REPORT_REASON_OPTIONS.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} /> {label}</label>
        ))}
      </fieldset>
      {reason === "COPYRIGHT" && (
        <div className="space-y-2 rounded border border-zinc-800 p-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} /> I am the rights holder or authorised to act for them</label>
          <Input aria-label="Link to the original work" placeholder="Link to the original work (optional)" value={original} maxLength={300} onChange={(e) => setOriginal(e.target.value)} className="border-zinc-700 bg-zinc-900" />
        </div>
      )}
      <textarea aria-label="Details" rows={3} maxLength={1000} placeholder="More details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-400" />
      <Button type="submit" disabled={report.isPending} className="bg-orange-700 text-white hover:bg-orange-800">Send report</Button>
    </form>
  );
}

/** Report dialog (TS-1): reason, details, extra copyright fields. Signed-out visitors are asked to sign in first. */
export function ReportDialog() {
  const target = useDialogs((s) => s.report);
  const close = useDialogs((s) => s.close);
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report</DialogTitle>
          <DialogDescription className="truncate">{target?.label}</DialogDescription>
        </DialogHeader>
        {target ? <Form key={`${target.targetType}:${target.targetId}`} target={target} close={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** Opens the report dialog, or the sign-in prompt for visitors. */
export function startReport(signedIn: boolean, target: ReportTarget) {
  if (signedIn) useDialogs.getState().openReport(target);
  else useAuthPrompt.getState().show("Sign in to report content", () => useDialogs.getState().openReport(target));
}
