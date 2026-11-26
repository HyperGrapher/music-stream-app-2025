"use client";

import { AddToPlaylistDialog } from "./AddToPlaylistDialog";
import { NextUpPanel } from "./NextUpPanel";
import { ShareDialog } from "./ShareDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";

/** Dialogs and panels opened from anywhere, mounted once in the player layout. */
export function GlobalDialogs() {
  return (
    <>
      <AddToPlaylistDialog />
      <ShareDialog />
      <ShortcutsDialog />
      <NextUpPanel />
    </>
  );
}
