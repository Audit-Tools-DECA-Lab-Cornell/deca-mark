import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { createApiClient } from "../../data/api/client";
import { createAccount, verifyEmail } from "../auth/auth-calls";
import { runAccountDeletion } from "./deletion";

/**
 * MOB-07 against the LOCAL stack only: the collector's own deletion run, on its API client, for a new
 * account. The local API has no Auth Admin key (BE-08), so `DELETE /v1/me` answers 503 before it changes
 * anything: the run must say "unavailable", and the account must be intact afterwards. Skipped unless
 * asked for:
 *
 *   DECAMARK_DELETE_LOCAL_TEST=1 DECAMARK_LOCAL_SUPABASE_KEY=<publishable key> \
 *     pnpm --dir mobile exec vitest run deletion.acceptance
 */

const {
  DECAMARK_DELETE_LOCAL_TEST: flag,
  DECAMARK_LOCAL_SUPABASE_URL: supabaseUrl = "http://127.0.0.1:54321",
  DECAMARK_LOCAL_SUPABASE_KEY: publishableKey = "",
  DECAMARK_LOCAL_API_URL: apiUrl = "http://127.0.0.1:8001",
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

async function verificationCode(email: string): Promise<string> {
  const origin = loopback(mailpit, "54324");
  for (let attempt = 0; attempt < 40; attempt++) {
    const listing = (await (await fetch(`${origin}/api/v1/messages`)).json()) as Listing;
    const message = listing.messages.find(
      (item) =>
        item.Subject.toLowerCase().includes("verification") &&
        item.To.some((to) => to.Address === email),
    );
    if (message) {
      const detail = (await (await fetch(`${origin}/api/v1/message/${message.ID}`)).json()) as {
        Text: string;
        HTML: string;
      };
      const code = /\b(\d{6})\b/.exec(`${detail.Text} ${detail.HTML}`)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Mailpit did not receive the verification code for ${email}`);
}

it.skipIf(!enabled)(
  "says deletion is not available on a server without its Auth Admin key, and changes nothing",
  { timeout: 120_000 },
  async () => {
    if (!publishableKey) throw new Error("DECAMARK_LOCAL_SUPABASE_KEY is required");
    const store = new Map<string, string>();
    const phone = createClient(loopback(supabaseUrl, "54321"), publishableKey, {
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
    const email = `mob07-${Date.now()}@example.com`;
    expect(await createAccount(phone.auth, email, "DecamarkDelete!1015")).toEqual({ ok: true });
    expect(await verifyEmail(phone.auth, email, await verificationCode(email))).toEqual({
      ok: true,
    });
    const userId = (await phone.auth.getSession()).data.session?.user.id ?? null;
    expect(userId).not.toBeNull();
    const client = createApiClient(loopback(apiUrl, "8001"), async () => {
      const { data } = await phone.auth.getSession();
      return data.session?.user.id === userId ? data.session.access_token : null;
    });
    const signal = new AbortController().signal;
    await client.updateProfile({ display_name: "Delete Probe", observer_initials: "DP" }, signal);

    const outcome = await runAccountDeletion({
      confirmedFor: userId ?? "",
      signedInAs: () => userId,
      send: () => client.deleteMe(signal),
      wait: async () => {},
    });
    expect(outcome).toEqual({ kind: "unavailable" });

    // Nothing changed: the profile and the Training membership are still there.
    const after = await client.me(signal);
    expect(after.profile.observer_initials).toBe("DP");
    expect(after.project_memberships.some((project) => project.is_training)).toBe(true);
    await phone.auth.signOut({ scope: "local" });
  },
);
