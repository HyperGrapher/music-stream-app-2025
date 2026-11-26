/**
 * The one place that maps tRPC errors (and their application codes, PRD section 17) to text for
 * people. `error.data.appCode` is set by `server/errors.ts`.
 */
interface TrpcLikeError {
  message: string;
  data?: { appCode?: string | null; retryAfterSeconds?: number | null; code?: string } | null;
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
  return error.message || fallback;
}
