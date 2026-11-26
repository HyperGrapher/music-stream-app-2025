"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const HEARTBEAT_MS = 20_000;

function stored(storage: "local" | "session", key: string): string {
  try {
    const area = storage === "local" ? window.localStorage : window.sessionStorage;
    let value = area.getItem(key);
    if (!value) {
      value = crypto.randomUUID();
      area.setItem(key, value);
    }
    return value;
  } catch {
    return crypto.randomUUID();
  }
}

const doNotTrack = () => navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

/**
 * Reports page views for the admin analytics (who is online, which pages, how long). One request when a page opens and a
 * light heartbeat while it is visible. Visitors are told apart by a random id in local storage (no cookie, no personal
 * data in the browser). Do Not Track and Global Privacy Control are respected.
 */
export function VisitTracker() {
  const pathname = usePathname();
  const viewId = useRef<string | null>(null);
  const visitorId = useRef<string>("");
  const first = useRef(true);

  useEffect(() => {
    if (doNotTrack() || pathname.startsWith("/admin")) return;
    visitorId.current ||= stored("local", "ms_vid");
    const sessionId = stored("session", "ms_sid");
    viewId.current = null;
    let cancelled = false;
    const referrer = first.current ? document.referrer : "";
    first.current = false;
    void fetch("/api/analytics", { method: "POST", headers: { "content-type": "application/json" }, keepalive: true, body: JSON.stringify({ type: "hit", visitorId: visitorId.current, sessionId, path: pathname, referrer }) })
      .then((r) => (r.ok && r.status !== 204 ? (r.json() as Promise<{ viewId?: string }>) : null))
      .then((data) => { if (!cancelled && data?.viewId) viewId.current = data.viewId; })
      .catch(() => undefined);

    const ping = () => {
      if (!viewId.current) return;
      const payload = JSON.stringify({ type: "ping", visitorId: visitorId.current, viewId: viewId.current });
      if (!navigator.sendBeacon("/api/analytics", new Blob([payload], { type: "application/json" }))) void fetch("/api/analytics", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: payload }).catch(() => undefined);
    };
    const timer = setInterval(() => { if (document.visibilityState === "visible") ping(); }, HEARTBEAT_MS);
    const onHide = () => { if (document.visibilityState === "hidden") ping(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", ping);
    return () => {
      cancelled = true;
      ping();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", ping);
    };
  }, [pathname]);

  return null;
}
