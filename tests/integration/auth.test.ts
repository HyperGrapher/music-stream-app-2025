import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { auth } from "@/lib/auth";
import { db } from "./helpers";

const email = `it-auth-${crypto.randomUUID()}@example.test`;
const password = "integration-pass-123";

after(async () => {
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
});

describe("email/password accounts", () => {
  it("signs up, then signs in with the same credentials", async () => {
    const created = await auth.api.signUpEmail({
      body: { email, password, name: "Integration" },
    });
    assert.equal(created.user.email, email);

    const signedIn = await auth.api.signInEmail({ body: { email, password } });
    assert.equal(signedIn.user.id, created.user.id);
  });

  it("rejects a wrong password", async () => {
    await assert.rejects(
      auth.api.signInEmail({ body: { email, password: "wrong-password-123" } }),
    );
  });

  it("does not create a second user for an existing email", async () => {
    await assert.rejects(
      auth.api.signUpEmail({ body: { email, password, name: "Again" } }),
    );
    assert.equal(await db.user.count({ where: { email } }), 1);
  });

  it("stores the credential as a linked account of that single user", async () => {
    const user = await db.user.findUniqueOrThrow({
      where: { email },
      include: { accounts: true },
    });
    assert.deepEqual(user.accounts.map((a) => a.providerId), ["credential"]);
  });
});

describe("usernames (IA-1) and roles (2.2)", () => {
  const made: string[] = [];
  after(async () => {
    await db.user.deleteMany({ where: { id: { in: made } } });
  });
  const signUp = async (name: string, mail = `it-name-${crypto.randomUUID()}@example.test`) => {
    const { user } = await auth.api.signUpEmail({ body: { email: mail, password, name } });
    made.push(user.id);
    return db.user.findUniqueOrThrow({ where: { id: user.id } });
  };

  it("gives every new account a valid lowercase permalink handle", async () => {
    const user = await signUp("Ana María Çelik");
    assert.equal(user.username, "ana_maria_celik");
    assert.equal(user.role, "USER");
    assert.equal(user.plan, "FREE");
  });

  it("makes handles unique by appending a counter", async () => {
    const base = `Sam Collision ${crypto.randomUUID().slice(0, 4)}`;
    const first = await signUp(base);
    const second = await signUp(base);
    assert.notEqual(first.username, second.username);
    assert.match(second.username, new RegExp(`^${first.username}_?-?2$`));
  });

  it("never hands out a reserved word", async () => {
    for (const name of ["Admin", "Settings", "Upload"]) {
      const user = await signUp(name);
      assert.ok(!["admin", "settings", "upload"].includes(user.username), user.username);
      assert.match(user.username, /^[a-z0-9][a-z0-9_-]{2,24}$/);
    }
  });

  it("does not let a client choose its own role or username at sign-up", async () => {
    for (const extra of [{ role: "ADMIN" }, { username: "admin" }, { plan: "PRO" }]) {
      const mail = `it-hostile-${crypto.randomUUID()}@example.test`;
      // Better Auth refuses fields declared `input: false` and silently drops unknown ones.
      await auth.api
        .signUpEmail({ body: { email: mail, password, name: "Hostile", ...extra } as never })
        .catch(() => undefined);
      // either way, no privileged account may exist
      const stored = await db.user.findUnique({ where: { email: mail } });
      if (stored) made.push(stored.id);
      assert.ok(!stored || (stored.role === "USER" && stored.plan === "FREE" && stored.username !== "admin"));
    }
  });

  it("grants ADMIN to emails listed in ADMIN_EMAILS", async () => {
    const existing = await db.user.findUnique({ where: { email: "it-admin@example.test" } });
    if (existing) await db.user.delete({ where: { id: existing.id } });
    const admin = await signUp("The Admin", "it-admin@example.test");
    assert.equal(admin.role, "ADMIN");
  });
});
