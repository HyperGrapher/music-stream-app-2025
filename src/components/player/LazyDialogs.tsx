"use client";

import dynamic from "next/dynamic";

/** Dialogs and the Next up panel are rarely opened: load them after the page is interactive instead of in its first bundle. */
const GlobalDialogs = dynamic(() => import("./GlobalDialogs").then((m) => m.GlobalDialogs), { ssr: false });

export function LazyDialogs() {
  return <GlobalDialogs />;
}
