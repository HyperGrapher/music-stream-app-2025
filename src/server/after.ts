import { after } from "next/server";

/**
 * Runs post-response work (R2 deletions, emails, notifications) via Next's `after()`. Outside a
 * request scope (tests, scripts) `after` throws, so the task just runs in the background instead.
 * Anything important must also be recoverable from a durable table (see StorageDeletion).
 */
export function runAfter(task: () => Promise<unknown>) {
  const guarded = () => task().catch((error: unknown) => console.error("[after] task failed:", error));
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
