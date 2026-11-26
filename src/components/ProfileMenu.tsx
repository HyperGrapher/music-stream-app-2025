"use client";

import { Ban, Flag, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { startReport } from "@/components/player/ReportDialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useUser } from "@/hooks/useUser";
import { friendlyError } from "@/lib/error-messages";
import { useAuthPrompt } from "@/store/authPrompt";
import { api } from "@/trpc/react";

/** The "…" menu of a profile: Block / Unblock (BL-1) and Report (TS-1). Not shown on your own profile. */
export function ProfileMenu({ userId, name }: { userId: string; name: string }) {
  const { user } = useUser();
  const router = useRouter();
  const utils = api.useUtils();
  const blocked = api.trust.blocked.useQuery(undefined, { enabled: !!user });
  const isBlocked = !!blocked.data?.some((b) => b.id === userId);
  const set = api.trust.setBlock.useMutation({
    onSuccess: (r) => { toast.success(r.blocked ? `Blocked ${name}` : `Unblocked ${name}`); void utils.trust.blocked.invalidate(); router.refresh(); },
    onError: (error) => toast.error(friendlyError(error, "Could not update the block")),
  });
  if (user?.id === userId) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label={`More actions for ${name}`} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => (user ? set.mutate({ userId, blocked: !isBlocked }) : useAuthPrompt.getState().show("Sign in to block people"))}><Ban /> {isBlocked ? "Unblock" : "Block"}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => startReport(!!user, { targetType: "USER", targetId: userId, label: name })}><Flag /> Report</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
