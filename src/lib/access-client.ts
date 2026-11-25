/** `s=<token>` / `c=<id>&s=<token>` (as carried on `PlayerTrack.accessQuery`) -> tRPC `access` input. */
export function parseAccessQuery(query: string | undefined) {
  if (!query) return undefined;
  const params = new URLSearchParams(query);
  const secret = params.get("s");
  if (!secret) return undefined;
  return { secret, collectionId: params.get("c") ?? undefined };
}
