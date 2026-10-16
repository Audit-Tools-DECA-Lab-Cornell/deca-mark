import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { createApiClient } from "../../data/api/client";
import { ApiError } from "../../data/api/errors";
import { refreshMeCache, selectProject } from "../../data/api/me-cache";
import { createAccount, verifyEmail } from "../auth/auth-calls";
import { deviceProjects } from "../preview/device-projects";
import { isValidInitials } from "./identity";
import { ALREADY_MEMBER, invitationFromPreview, joinCodeOf, joinFailure } from "./invitation";

// The gate is decided by a pure function; keep the native modules its hook reaches out of Node.
vi.mock("expo-sqlite/kv-store", () => ({
  default: { getItemSync: () => null, setItemSync: () => undefined },
}));
vi.mock("../../auth/provider", () => ({ useAccount: () => ({}) }));
vi.mock("../../data/api/me-provider", () => ({ useMe: () => ({}) }));
vi.mock("../preview/data-source", () => ({ PREVIEW_ALLOWED: false }));
const { decideGate } = await import("../auth/gate");

/**
 * MOB-06 and WEB-07 on the LOCAL stack only: a new observer on the phone's own path (the collector's
 * auth calls, its API client and its project and gate logic, without the screens) signs up, lands on
 * Projects with Training once the profile is saved, previews and redeems a join code a manager made,
 * and then has the joined project as the active one. Skipped unless asked for:
 *
 *   DECAMARK_JOIN_LOCAL_TEST=1 DECAMARK_LOCAL_SUPABASE_KEY=<publishable key from supabase status> \
 *     DECAMARK_LOCAL_PROJECT_ID=<project from database/.local/web-workspace.json> \
 *     pnpm --dir mobile exec vitest run join.acceptance
 *
 * The manager is the seed's `manager@fieldmaps.test`, with the seed's public local password.
 */

const {
  DECAMARK_JOIN_LOCAL_TEST: flag,
  DECAMARK_LOCAL_SUPABASE_URL: supabaseUrl = "http://127.0.0.1:54321",
  DECAMARK_LOCAL_SUPABASE_KEY: publishableKey = "",
  DECAMARK_LOCAL_API_URL: apiUrl = "http://127.0.0.1:8001",
  DECAMARK_LOCAL_MAILPIT_URL: mailpit = "http://127.0.0.1:54324",
  DECAMARK_LOCAL_PROJECT_ID: projectId = "",
} = process.env;
const enabled = flag === "1";
const MANAGER = { email: "manager@fieldmaps.test", password: "FieldMaps-local-only-42!" };

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
  "a new observer reaches Projects with Training, then redeems a manager's code and sees the joined project",
  { timeout: 120_000 },
  async () => {
    if (!publishableKey || !projectId) throw new Error("The local key and project are required");
    const api = loopback(apiUrl, "8001");

    // A manager makes a single-use observer code on the web's endpoint.
    const manager = localClient();
    const signedIn = await manager.auth.signInWithPassword(MANAGER);
    expect(signedIn.error).toBeNull();
    const created = await fetch(`${api}/v1/projects/${projectId}/invitations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${signedIn.data.session?.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "observer", max_uses: 1 }),
    });
    expect(created.status).toBe(201);
    const { code: issued } = (await created.json()) as { code: string };

    // The observer signs up on the phone path and verifies with the code from Mailpit.
    const phone = localClient();
    const email = `mob06-${Date.now()}@example.com`;
    expect(await createAccount(phone.auth, email, "DecamarkObserver!1015")).toEqual({ ok: true });
    expect(await verifyEmail(phone.auth, email, await verificationCode(email))).toEqual({
      ok: true,
    });
    const client = createApiClient(api, async () => {
      const { data } = await phone.auth.getSession();
      return data.session?.access_token ?? null;
    });
    const signal = new AbortController().signal;

    // Before the profile: Training is there, and the gate sends the account to onboarding.
    const first = await client.me(signal);
    expect(first.project_memberships.map((project) => project.is_training)).toEqual([true]);
    const gate = (initials: string | null) =>
      decideGate({
        session: true,
        cachedAccount: true,
        accountDeleted: false,
        meReady: true,
        serverInitials: isValidInitials(initials ?? ""),
        localProfile: "none",
      }).route;
    expect(gate(first.profile.observer_initials)).toBe("onboarding");

    // The profile step: PATCH /v1/me. Then the app opens on Projects, with Training on the list.
    await client.updateProfile(
      { display_name: "Mobile Observer", observer_initials: "MO" },
      signal,
    );
    const profiled = await client.me(signal);
    expect(profiled.profile.observer_initials).toBe("MO");
    expect(gate(profiled.profile.observer_initials)).toBe("app");
    const training = deviceProjects(
      profiled.project_memberships,
      profiled.organization_memberships,
    );
    expect(training.map((project) => project.training)).toEqual([true]);
    const before = refreshMeCache(profiled, null);
    expect(before.activeProjectId).toBe(training[0]?.id);

    // The join step: the code as typed (lower case, with a dash) previews, then redeems.
    const typed = `${issued.slice(0, 4).toLowerCase()}-${issued.slice(4)}`;
    const code = joinCodeOf(typed);
    expect(code).toBe(issued);
    const invitation = invitationFromPreview(code, await client.previewInvitation(code, signal));
    expect(invitation.role).toBe("observer");
    const joined = await client.redeemInvitation(code, signal);
    expect(joined.project_id).toBe(projectId);

    // /v1/me again, and the joined project made active: Projects lists it beside Training.
    const after = await client.me(signal);
    const snapshot = { ...refreshMeCache(after, before), activeProjectId: joined.project_id };
    expect(selectProject(after, snapshot.activeProjectId)).toBe(projectId);
    const listed = deviceProjects(after.project_memberships, after.organization_memberships);
    expect(listed.map((project) => [project.id === projectId, project.training]).sort()).toEqual([
      [false, true],
      [true, false],
    ]);
    expect(listed.find((project) => project.id === projectId)?.name).toBe(invitation.project);

    // The single-use code is spent: a second try says so, in the join step's words.
    const again = await client.redeemInvitation(code, signal).catch((error: unknown) => error);
    expect(again).toBeInstanceOf(ApiError);
    expect(joinFailure(again as ApiError, "redeem").message).not.toBe("");
    expect(ALREADY_MEMBER).toBe("You may already be in this project.");

    await phone.auth.signOut({ scope: "local" });
    await manager.auth.signOut({ scope: "local" });
  },
);
