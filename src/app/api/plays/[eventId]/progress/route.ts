import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/server/db";

export const runtime = "nodejs";

const bodySchema = z.object({
  listenedMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  completed: z.boolean().optional(),
});

/**
 * Real listening time of one play (PL-P9), sent by the player as a beacon when a track ends or the
 * page closes. The event id comes from the play response and is unguessable; values only ever grow,
 * so a late or repeated beacon cannot lower what was already reported. Statistics only: always 204.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(eventId).success || !body.success) return new NextResponse(null, { status: 204 });

  const event = await db.playEvent.findUnique({ where: { id: eventId }, select: { listenedMs: true, completed: true, track: { select: { durationMs: true } } } });
  if (event) {
    // Cannot have listened to more than a few loops of the track.
    const cap = Math.max(event.track.durationMs * 5, 60_000);
    await db.playEvent.update({
      where: { id: eventId },
      data: {
        listenedMs: Math.max(event.listenedMs, Math.min(body.data.listenedMs, cap)),
        completed: event.completed || body.data.completed === true,
      },
    });
  }
  return new NextResponse(null, { status: 204 });
}
