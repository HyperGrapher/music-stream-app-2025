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
