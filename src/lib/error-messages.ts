/**
 * The one place that maps tRPC errors (and their application codes, PRD section 17) to text for
 * people. `error.data.appCode` is set by `server/errors.ts`.
 */
interface TrpcLikeError {
  message: string;
  data?: { appCode?: string | null; retryAfterSeconds?: number | null; code?: string } | null;
}

interface ZodIssueLike {
  code?: string;
  path?: (string | number)[];
  message?: string;
}

const humanise = (word: string) => word.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** "links.0.url" -> "Link 1", "tags.2" -> "Tag 3", "title" -> "Title". */
function fieldLabel(path: (string | number)[] = []): string {
  const parts = path.filter((p): p is string => typeof p === "string");
  const index = path.find((p): p is number => typeof p === "number");
  const base = parts[0] ?? "";
  const singular = base.endsWith("s") ? base.slice(0, -1) : base;
  if (!base) return "";
  return index !== undefined ? `${humanise(singular)} ${index + 1}` : humanise(base);
}

/**
 * tRPC puts a failed zod validation into `message` as a JSON array of issues. People get one short sentence per
 * problem instead: invalid URLs say what is expected; everything else keeps zod's own wording with the field named.
 */
function validationMessage(message: string): string | null {
  if (!message.startsWith("[")) return null;
  let issues: ZodIssueLike[];
  try {
    const parsed: unknown = JSON.parse(message);
    if (!Array.isArray(parsed) || !parsed.every((i) => typeof i === "object" && i !== null && "message" in i)) return null;
    issues = parsed as ZodIssueLike[];
  } catch {
    return null;
  }
  const lines: string[] = [];
  const seenFields = new Set<string>();
  for (const issue of issues) {
    const label = fieldLabel(issue.path);
    const msg = issue.message ?? "";
    const isUrl = (issue.code === "invalid_format" && issue.message === "Invalid URL") || msg.includes("http(s)") || msg.includes("https://");
    // One line per field: the URL issue and the "must be http(s)" refinement describe the same mistake.
    const key = `${label}|${isUrl ? "url" : issue.message}`;
    if (seenFields.has(key)) continue;
    seenFields.add(key);
    const text = isUrl ? "enter a full web address starting with https://" : msg || "is not valid";
    lines.push(label ? `${label}: ${text}` : text);
  }
  return lines.join(". ") || null;
}

export function friendlyError(error: TrpcLikeError, fallback = "Something went wrong. Try again."): string {
  switch (error.data?.appCode) {
    case "RATE_LIMITED":
      return `Slow down, try again in ${error.data.retryAfterSeconds ?? "a few"} s`;
    case "EMAIL_NOT_VERIFIED":
      return "Verify your email first. We sent you a link when you signed up.";
    case "PLAN_REQUIRED":
      return "This is a Pro feature.";
    case "UPLOAD_LIMIT_REACHED":
      return "You've used all your upload time. Free some up or upgrade.";
    case "BLOCKED":
      return "You can't do that.";
  }
  if (error.data?.code === "UNAUTHORIZED") return "Sign in to do that.";
  return validationMessage(error.message) ?? (error.message || fallback);
}
