import { db } from "@/server/db";
import { createCaller } from "@/server/api/root";

const created: string[] = [];

export async function createUser(label: string) {
  const id = crypto.randomUUID();
  await db.user.create({
    data: {
      id,
      name: `it-${label}`,
      email: `it-${label}-${id}@example.test`,
      emailVerified: true,
    },
  });
  created.push(id);
  return id;
}

/** Removing the users cascades to their assets, tracks and releases. */
export async function cleanup() {
  await db.user.deleteMany({ where: { id: { in: created } } });
  created.length = 0;
}

export async function createAsset(
  ownerId: string,
  opts: { kind?: "AUDIO" | "IMAGE"; status?: "PENDING" | "READY" | "ATTACHED" } = {},
) {
  const kind = opts.kind ?? "AUDIO";
  const prefix = kind === "AUDIO" ? "uploads" : "artworks";
  return db.mediaAsset.create({
    data: {
      ownerId,
      kind,
      status: opts.status ?? "READY",
      bucket: "test-bucket",
      storageKey: `${prefix}/${ownerId}/${crypto.randomUUID()}-file`,
      originalFilename: "file",
      mimeType: kind === "AUDIO" ? "audio/mpeg" : "image/png",
    },
  });
}

/** tRPC caller acting as `userId`, or anonymous when omitted. */
export function callerFor(userId?: string) {
  const session = userId
    ? { user: { id: userId }, session: { userId } }
    : null;
  return createCaller({ db, session, headers: new Headers() } as never);
}

export { db };
