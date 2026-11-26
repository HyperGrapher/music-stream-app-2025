import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ensureAdminRole, isAdminEmail } from "./admin-role";

describe("ADMIN_EMAILS", () => {
  it("matches case-insensitively, ignores spaces and empty entries", () => {
    const raw = " Me@Example.com , other@example.com,, ";
    assert.equal(isAdminEmail("me@example.com", raw), true);
    assert.equal(isAdminEmail("OTHER@EXAMPLE.COM", raw), true);
    assert.equal(isAdminEmail("nobody@example.com", raw), false);
    assert.equal(isAdminEmail("me@example.com", ""), false);
  });
});

describe("ensureAdminRole", () => {
  const fakeDb = (user: { email: string; emailVerified: boolean; role: "USER" | "ADMIN" }) => {
    const updates: unknown[] = [];
    return { updates, db: { user: { findUnique: () => Promise.resolve(user), update: (arg: unknown) => { updates.push(arg); return Promise.resolve(user); } } } as never };
  };
  it("promotes a verified listed email, and never an unverified one", async () => {
    process.env.ADMIN_EMAILS = "boss@example.com";
    const verified = fakeDb({ email: "Boss@Example.com", emailVerified: true, role: "USER" });
    assert.equal(await ensureAdminRole(verified.db, "u1"), "ADMIN");
    assert.equal(verified.updates.length, 1);
    const unverified = fakeDb({ email: "boss@example.com", emailVerified: false, role: "USER" });
    assert.equal(await ensureAdminRole(unverified.db, "u2"), "USER");
    assert.equal(unverified.updates.length, 0);
    const other = fakeDb({ email: "x@example.com", emailVerified: true, role: "USER" });
    assert.equal(await ensureAdminRole(other.db, "u3"), "USER");
    const already = fakeDb({ email: "x@example.com", emailVerified: true, role: "ADMIN" });
    assert.equal(await ensureAdminRole(already.db, "u4"), "ADMIN");
    delete process.env.ADMIN_EMAILS;
  });
});
