import { create } from "zustand";

import type { PlayerTrack } from "@/types/player-track";

/** What the share dialog is about: a track (with its current time) or a set. */
export interface ShareTarget {
  kind: "track" | "set";
  id: string;
  title: string;
  /** Canonical path (`/user/slug`, secret suffix included when the viewer reached it that way). */
  path: string;
  /** Hidden content cannot be embedded or shared to social networks without its secret link. */
  isPrivate?: boolean;
  embeddable?: boolean;
  /** Secret token that makes a private embed work. */
  secret?: string | null;
  /** Seconds into the track, for the "Start at 1:23" option. */
  atSeconds?: number;
}

/** What is being reported (TS-1). */
export interface ReportTarget {
  targetType: "TRACK" | "COLLECTION" | "COMMENT" | "USER";
  targetId: string;
  /** Shown in the dialog title: the track title, user name, "this comment"... */
  label: string;
}

interface DialogState {
  addToPlaylist: PlayerTrack | null;
  share: ShareTarget | null;
  report: ReportTarget | null;
  openReport: (target: ReportTarget) => void;
  shortcutsOpen: boolean;
  openAddToPlaylist: (track: PlayerTrack) => void;
  openShare: (target: ShareTarget) => void;
  setShortcutsOpen: (open: boolean) => void;
  close: () => void;
}

/** Dialogs opened from menus anywhere in the app and rendered once by `GlobalDialogs`. */
export const useDialogs = create<DialogState>((set) => ({
  addToPlaylist: null,
  share: null,
  report: null,
  openReport: (report) => set({ report }),
  shortcutsOpen: false,
  openAddToPlaylist: (track) => set({ addToPlaylist: track }),
  openShare: (target) => set({ share: target }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  close: () => set({ addToPlaylist: null, share: null, report: null }),
}));
