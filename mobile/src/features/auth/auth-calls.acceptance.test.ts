import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import {
  createAccount,
  resendSignUpCode,
  sendRecoveryCode,
  setNewPassword,
  verifyEmail,
  verifyRecoveryCode,
} from "./auth-calls";
import { authFailure, signInFailure } from "./rules";

/**
 * MOB-05 against the LOCAL stack only: the collector's own auth calls, on a real supabase-js client,
 * against local Supabase Auth, with the six-digit codes read from local Mailpit. Skipped unless asked
 * for; the public local key comes from `supabase status`, never a file:
 *
 *   DECAMARK_AUTH_LOCAL_TEST=1 DECAMARK_LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
 *     DECAMARK_LOCAL_SUPABASE_KEY=<publishable key> pnpm --dir mobile exec vitest run auth-calls.acceptance
 */

const {
  DECAMARK_AUTH_LOCAL_TEST: flag,
  DECAMARK_LOCAL_SUPABASE_URL: supabaseUrl = "http://127.0.0.1:54321",
  DECAMARK_LOCAL_SUPABASE_KEY: publishableKey = "",
  DECAMARK_LOCAL_MAILPIT_URL: mailpit = "http://127.0.0.1:54324",
} = process.env;
const enabled = flag === "1";

function loopback(value: string, port: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port !== port)
    throw new Error(`Only the local stack is used; refusing ${url.origin}.`);
  return url.origin;
}

type Listing = { messages: { ID: string; Subject: string; To: { Address: string }[] }[] };

/** The six-digit code in the newest email to `email` whose subject contains `subject`. */
async function codeFrom(email: string, subject: string, after: Set<string>): Promise<string> {
  const origin = loopback(mailpit, "54324");
  for (let attempt = 0; attempt < 40; attempt++) {
    const listing = (await (await fetch(`${origin}/api/v1/messages`)).json()) as Listing;
    const message = listing.messages.find(
      (item) =>
        !after.has(item.ID) &&
        item.Subject.toLowerCase().includes(subject) &&
        item.To.some((to) => to.Address === email),
    );
    if (message) {
      after.add(message.ID);
      const detail = (await (await fetch(`${origin}/api/v1/message/${message.ID}`)).json()) as {
        Text: string;
        HTML: string;
      };
      const code = /\b(\d{6})\b/.exec(`${detail.Text} ${detail.HTML}`)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Mailpit did not receive "${subject}" for ${email}`);
}

function localClient() {
  const store = new Map<string, string>();
  return createClient(loopback(supabaseUrl, "54321"), publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => {
          store.set(key, value);
        },
        removeItem: (key) => {
          store.delete(key);
        },
      },
    },
  });
}

it.skipIf(!enabled)(
  "signs up, verifies, recovers and signs in with the new password through the collector's auth calls",
  { timeout: 120_000 },
  async () => {
    if (!publishableKey) throw new Error("DECAMARK_LOCAL_SUPABASE_KEY is required");
    const client = localClient();
    const email = `mob05-${Date.now()}@example.com`;
    const password = "DecamarkMobile!1015";
    const nextPassword = "DecamarkRecovered!1015";
    const seen = new Set<string>();

    // Create account: Supabase sends the verification code.
    expect(await createAccount(client.auth, email, password)).toEqual({ ok: true });

    // Sign-in before verifying says so; "Send a new code" resends (or asks to wait).
    const unconfirmed = await client.auth.signInWithPassword({ email, password });
    expect(signInFailure(unconfirmed.error)).toBe("unconfirmed");
    const resent = await resendSignUpCode(client.auth, email);
    expect(resent.ok || resent.failure === "rateLimited").toBe(true);

    // A wrong code is refused as a code; the code from Mailpit signs the new account in.
    expect(await verifyEmail(client.auth, email, "000000")).toEqual({ ok: false, failure: "code" });
    const verification = await codeFrom(email, "verification", seen);
    let verified = await verifyEmail(client.auth, email, verification);
    if (!verified.ok && resent.ok) {
      // The resend replaced the first code: take the next one.
      verified = await verifyEmail(client.auth, email, await codeFrom(email, "verification", seen));
    }
    expect(verified).toEqual({ ok: true });
    expect((await client.auth.getSession()).data.session?.user.email).toBe(email);
    await client.auth.signOut({ scope: "local" });

    // A wrong password is "credentials".
    const wrong = await client.auth.signInWithPassword({ email, password: "not-the-password" });
    expect(signInFailure(wrong.error)).toBe("credentials");

    // Recovery: a code, a wrong code refused, the right one, the same password refused, a new one saved.
    expect(await sendRecoveryCode(client.auth, email)).toEqual({ ok: true });
    const recovery = await codeFrom(email, "reset", seen);
    expect(await verifyRecoveryCode(client.auth, email, "000000")).toEqual({
      ok: false,
      failure: "code",
    });
    expect(await verifyRecoveryCode(client.auth, email, recovery)).toEqual({ ok: true });
    expect(await setNewPassword(client.auth, password)).toEqual({
      ok: false,
      failure: "samePassword",
    });
    expect(await setNewPassword(client.auth, nextPassword)).toEqual({ ok: true });
    await client.auth.signOut({ scope: "local" });

    // The old password no longer works; the new one does.
    const old = await client.auth.signInWithPassword({ email, password });
    expect(authFailure(old.error)).toBe("credentials");
    const signedIn = await client.auth.signInWithPassword({ email, password: nextPassword });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.user?.email).toBe(email);
    await client.auth.signOut({ scope: "local" });
  },
);
