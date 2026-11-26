import { TRPCError } from "@trpc/server";

import type { PrismaClient } from "@/generated/prisma/client";
import { isReservedUsername, normalizeUsername, RESERVED_USERNAMES, USERNAME_PATTERN } from "@/lib/names";

/**
 * Admin-managed reserved usernames, on top of the built-in `RESERVED_USERNAMES` (src/lib/names.ts). The built-in list
 * is code: no function here can add to, change or remove from it, and every mutation refuses its names.
 */
export const MAX_LIST_LINES = 5000;
export const MAX_LIST_CHARS = 200_000;

export type LineProblem = "INVALID" | "BUILT_IN" | "DUPLICATE";
export interface ParsedList {
  names: string[];
  rejected: { line: number; text: string; reason: LineProblem }[];
}

/**
 * Reads a text file with one name per line (blank lines and `#` comments are skipped). Names are lower-cased and must
 * look like a username. Built-in names and repeats are reported instead of added.
 */
export function parseNameList(text: string): ParsedList {
  const names: string[] = [];
  const seen = new Set<string>();
  const rejected: ParsedList["rejected"] = [];
  text.replace(/^﻿/, "").split(/\r\n|\r|\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const name = normalizeUsername(line);
    const reason: LineProblem | null = !USERNAME_PATTERN.test(name) ? "INVALID" : RESERVED_USERNAMES.has(name) ? "BUILT_IN" : seen.has(name) ? "DUPLICATE" : null;
    if (reason) return void rejected.push({ line: index + 1, text: line.slice(0, 60), reason });
    seen.add(name);
    names.push(name);
  });
  return { names, rejected };
}

const BUILT_IN_MESSAGE = "Built-in reserved names are part of the code and cannot be changed here";
const guardBuiltIn = (name: string) => {
  if (RESERVED_USERNAMES.has(normalizeUsername(name))) throw new TRPCError({ code: "FORBIDDEN", message: BUILT_IN_MESSAGE });
};

// A short cache: sign-up and username checks read this often; admin changes clear it at once (and other instances within 30 s).
let cache: { at: number; names: Set<string> } | null = null;
const CACHE_MS = 30_000;
export const clearReservedCache = () => {
  cache = null;
};

/** Names admins currently block. */
export async function blockedCustomNames(db: Pick<PrismaClient, "reservedName">): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.names;
  const rows = await db.reservedName.findMany({ where: { blocked: true }, select: { name: true } });
  cache = { at: Date.now(), names: new Set(rows.map((r) => r.name)) };
  return cache.names;
}

/** Reserved by the code list or blocked by an admin. This is the check every sign-up and rename goes through. */
export async function isReservedName(db: Pick<PrismaClient, "reservedName">, name: string): Promise<boolean> {
  return isReservedUsername(name) || (await blockedCustomNames(db)).has(normalizeUsername(name));
}

export async function listReservedNames(db: PrismaClient) {
  const custom = await db.reservedName.findMany({ orderBy: { name: "asc" }, take: 20_000, select: { name: true, blocked: true, note: true, createdAt: true } });
  return { builtIn: [...RESERVED_USERNAMES].sort(), custom };
}

export interface AddResult {
  added: number;
  existing: string[];
  rejected: ParsedList["rejected"];
}

/** Adds names from a parsed file or the single-name box (blocked right away). Names already stored are left as they are. */
export async function addReservedNames(db: PrismaClient, adminId: string, text: string, note?: string): Promise<AddResult> {
  if (text.length > MAX_LIST_CHARS) throw new TRPCError({ code: "BAD_REQUEST", message: "That file is too large" });
  const { names, rejected } = parseNameList(text);
  if (names.length + rejected.length > MAX_LIST_LINES) throw new TRPCError({ code: "BAD_REQUEST", message: `A list holds at most ${MAX_LIST_LINES} names` });
  const have = new Set((await db.reservedName.findMany({ where: { name: { in: names } }, select: { name: true } })).map((r) => r.name));
  const fresh = names.filter((n) => !have.has(n));
  if (fresh.length) await db.reservedName.createMany({ data: fresh.map((name) => ({ name, blocked: true, note: note?.trim().slice(0, 100) || null, createdById: adminId })), skipDuplicates: true });
  clearReservedCache();
  return { added: fresh.length, existing: names.filter((n) => have.has(n)), rejected };
}

/** Block or unblock one of the admin-added names. Built-in names are refused. */
export async function setReservedBlocked(db: PrismaClient, name: string, blocked: boolean) {
  guardBuiltIn(name);
  const result = await db.reservedName.updateMany({ where: { name: normalizeUsername(name) }, data: { blocked } });
  if (result.count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "That name is not in the list" });
  clearReservedCache();
}

/** Remove an admin-added name from the list. Built-in names are refused. */
export async function removeReservedName(db: PrismaClient, name: string) {
  guardBuiltIn(name);
  const result = await db.reservedName.deleteMany({ where: { name: normalizeUsername(name) } });
  if (result.count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "That name is not in the list" });
  clearReservedCache();
}
