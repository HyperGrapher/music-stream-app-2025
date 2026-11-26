"use client";

import Link from "next/link";

import { splitLinks } from "@/lib/message-links";

/** Message text with http(s) links made clickable (MS-2). Links to this site stay in the app; others open in a new tab. */
export function MessageText({ body }: { body: string }) {
  return (
    <p className="break-words whitespace-pre-wrap">
      {splitLinks(body).map((part, i) => {
        if (part.type === "text") return part.value;
        const url = new URL(part.value);
        if (url.host === window.location.host) {
          return <Link key={i} href={`${url.pathname}${url.search}${url.hash}`} className="underline decoration-white/40 underline-offset-2 hover:decoration-white">{part.value}</Link>;
        }
        return <a key={i} href={part.value} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-white/40 underline-offset-2 hover:decoration-white">{part.value}</a>;
      })}
    </p>
  );
}
