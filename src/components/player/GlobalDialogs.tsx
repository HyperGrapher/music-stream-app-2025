"use client";

import { AddToPlaylistDialog } from "./AddToPlaylistDialog";
import { NextUpPanel } from "./NextUpPanel";
import { RepostCaptionDialog } from "./RepostCaptionDialog";
import { ReportDialog } from "./ReportDialog";
import { ShareDialog } from "./ShareDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";

/** Dialogs and panels opened from anywhere, mounted once in the player layout. */
export function GlobalDialogs() {
  return (
    <>
      <AddToPlaylistDialog />
      <ShareDialog />
      <ReportDialog />
      <RepostCaptionDialog />
      <ShortcutsDialog />
      <NextUpPanel />
    </>
  );
}
