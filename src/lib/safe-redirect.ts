/** Only same-site relative paths are accepted as post-sign-in destinations (no open redirects). */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
