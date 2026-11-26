"use client";

import { useEffect } from "react";

/** Something threw while rendering: say so plainly and offer a retry (PRD 18.6). The digest ties it to the server log. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] render error", error.digest ?? "", error.message);
  }, [error]);
  return (
    <main role="alert" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-zinc-950 px-6 py-24 text-center text-white">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-zinc-400">This page failed to load. Try again, and if it keeps happening come back in a few minutes.{error.digest ? ` (Reference ${error.digest})` : ""}</p>
      <button type="button" onClick={reset} className="rounded-full bg-orange-700 px-5 py-2 text-sm font-semibold hover:bg-orange-600">Try again</button>
    </main>
  );
}
