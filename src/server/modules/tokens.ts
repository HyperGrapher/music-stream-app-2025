import { randomBytes } from "node:crypto";

/** 22-char URL-safe secret (128 random bits) for secret links (PRD IA-5). */
export function newSecretToken(): string {
  return randomBytes(16).toString("base64url");
}
