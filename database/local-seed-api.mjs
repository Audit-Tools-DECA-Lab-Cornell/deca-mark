// Local Auth transport. Runtime keys and access tokens stay in memory.
import { execFileSync } from "node:child_process";
import { localUrl } from "./seed-web-workspace.mjs";
import { password, roles, uuid } from "./zone-review-fixture.mjs";

export async function request(url, headers = {}, method = "GET", body, allowMissing = false) {
  const response = await fetch(url, {
    method, redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`${method} ${new URL(url).pathname}: HTTP ${response.status}`);
  if (response.status === 204) return null;
  try { return await response.json(); }
  catch { throw new Error(`${method} ${new URL(url).pathname}: invalid JSON response`); }
}

export async function localAccounts(root, apiUrl) {
  let status;
  try {
    status = JSON.parse(execFileSync("pnpm", ["dlx", "supabase@2.118.0", "status", "--output", "json"], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000,
    }));
  } catch { throw new Error("Could not read local Supabase status. Start pnpm db:start first."); }
  const authUrl = localUrl(status.API_URL, 54321);
  const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const adminKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
  if (typeof publicKey !== "string" || typeof adminKey !== "string")
    throw new Error("Local Supabase status is missing Auth keys.");
  await request(`${apiUrl}/ready`);
  const adminHeaders = { apikey: adminKey, Authorization: `Bearer ${adminKey}` };
  const accounts = {};
  for (const [index, role] of roles.entries()) {
    const email = `zone-${role}@fieldmaps.test`, id = uuid(100 + index);
    let user = await request(`${authUrl}/auth/v1/admin/users/${id}`, adminHeaders, "GET", undefined, true);
    if (!user) user = await request(`${authUrl}/auth/v1/admin/users`, adminHeaders, "POST", {
      id, email, password, email_confirm: true, user_metadata: { fixture: "zone-review-acceptance" },
    });
    if (user.id !== id || user.email !== email || user.user_metadata?.fixture !== "zone-review-acceptance")
      throw new Error(`Refusing unrelated local account: ${email}`);
    const session = await request(`${authUrl}/auth/v1/token?grant_type=password`, { apikey: publicKey },
      "POST", { email, password });
    if (typeof session.access_token !== "string") throw new Error("Local Auth returned no access token.");
    const api = (path, method = "GET", body, extraHeaders = {}) => request(`${apiUrl}${path}`,
      { Authorization: `Bearer ${session.access_token}`, ...extraHeaders }, method, body);
    await api("/v1/me");
    await api("/v1/me", "PATCH", { display_name: `Synthetic zone ${role}`, observer_initials: "ZR" });
    accounts[role] = { id, email, api };
  }
  return { accounts, authUrl, publicKey };
}
