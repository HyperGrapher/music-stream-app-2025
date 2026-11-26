"use client";

import { Check, Minus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/error-messages";
import { api } from "@/trpc/react";

const ROWS: { label: string; free: string | boolean; pro: string | boolean }[] = [
  { label: "Upload time", free: "180 minutes", pro: "Unlimited" },
  { label: "Max file size", free: "100 MB", pro: "100 MB" },
  { label: "Spotlight items on your profile", free: "1", pro: "5" },
  { label: "Scheduled releases", free: false, pro: true },
  { label: "Quiet Mode (hide public stats)", free: false, pro: true },
  { label: "Replace the audio file of a published track", free: false, pro: true },
  { label: "Insights time ranges", free: "Last 7 days", pro: "7 d to 12 months" },
  { label: "Insights breakdowns", free: false, pro: true },
  { label: "PRO badge on your profile", free: false, pro: true },
  { label: "Downloads, comments controls, embeds, license, all metadata", free: true, pro: true },
];

const Cell = ({ value }: { value: string | boolean }) =>
  typeof value === "string" ? <span>{value}</span> : value ? <Check className="mx-auto h-4 w-4 text-green-400" aria-label="Included" /> : <Minus className="mx-auto h-4 w-4 text-zinc-400" aria-label="Not included" />;

/** PL-1: two-column comparison and the demo upgrade (no payment is taken). */
export function PlanSettings() {
  const utils = api.useUtils();
  const { data } = api.plans.entitlements.useQuery();
  const setPlan = api.plans.setPlan.useMutation({
    onSuccess: async (result) => {
      toast.success(result.plan === "PRO" ? "You're on Pro (demo)" : "Back on Free");
      await utils.plans.entitlements.invalidate();
      await utils.upload.quota.invalidate();
    },
    onError: (error) => toast.error(friendlyError(error)),
  });
  if (!data) return <p className="text-sm text-zinc-400">Loading...</p>;
  const pro = data.plan === "PRO";
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Plan</h1>
      <p className="mb-6 text-sm text-zinc-400">
        You are on <strong className="text-white">{pro ? "Pro" : "Free"}</strong>. This is a demo: switching plans is instant and <strong>no payment is taken</strong>. Going back to Free never deletes or hides anything you uploaded.
      </p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-xs text-zinc-400 uppercase">
            <th className="py-2 pr-4 font-semibold"> </th>
            <th className="w-32 py-2 text-center font-semibold">Free</th>
            <th className="w-32 py-2 text-center font-semibold text-orange-400">Pro</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-b border-zinc-900">
              <td className="py-2.5 pr-4 text-zinc-300">{row.label}</td>
              <td className="py-2.5 text-center text-zinc-400"><Cell value={row.free} /></td>
              <td className="py-2.5 text-center"><Cell value={row.pro} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-6">
        {pro ? (
          <Button variant="outline" disabled={setPlan.isPending} onClick={() => setPlan.mutate({ plan: "FREE" })} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">
            Switch back to Free
          </Button>
        ) : (
          <Button disabled={setPlan.isPending} onClick={() => setPlan.mutate({ plan: "PRO" })} className="bg-orange-700 text-white hover:bg-orange-800">
            Upgrade to Pro (demo, no payment)
          </Button>
        )}
      </div>
    </div>
  );
}
