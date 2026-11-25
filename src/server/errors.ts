import { TRPCError } from "@trpc/server";

/** Application error codes carried in `error.data.appCode` (PRD section 17), mapped to UI text in src/lib/error-messages.ts. */
export type AppErrorCode =
  | "PLAN_REQUIRED"
  | "UPLOAD_LIMIT_REACHED"
  | "EMAIL_NOT_VERIFIED"
  | "BLOCKED"
  | "RATE_LIMITED";

type TrpcCode = ConstructorParameters<typeof TRPCError>[0]["code"];

export class AppCause extends Error {
  constructor(
    readonly appCode: AppErrorCode,
    message: string,
    readonly extra: { retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "AppCause";
  }
}

export function appError(
  code: TrpcCode,
  appCode: AppErrorCode,
  message: string,
  extra?: AppCause["extra"],
) {
  return new TRPCError({ code, message, cause: new AppCause(appCode, message, extra) });
}

export const planRequired = (message = "This needs a Pro plan") =>
  appError("FORBIDDEN", "PLAN_REQUIRED", message);

export const rateLimited = (retryAfterSeconds: number) =>
  appError("TOO_MANY_REQUESTS", "RATE_LIMITED", `Slow down, try again in ${retryAfterSeconds} s`, {
    retryAfterSeconds,
  });
