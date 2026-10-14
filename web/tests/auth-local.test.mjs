import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/client.node.js");
const enabled = process.env.DECAMARK_AUTH_LOCAL_TEST === "1";

test(
	"signs up, verifies, recovers and signs in with the new password through local web actions",
	{ skip: !enabled, timeout: 120000 },
	async () => {
		const origin = "http://localhost:3002";
		const mailbox = "http://127.0.0.1:54324";
		const email = `decamark-auth-${Date.now()}@example.com`;
		const password = "DecamarkLocalTest!1004";
		const nextPassword = "DecamarkRecovered!1004";
		const jar = new Map();
		await fetch(`${origin}/sign-up`);
		const manifest = JSON.parse(
			readFileSync(new URL("../.next/dev/server/server-reference-manifest.json", import.meta.url), "utf8")
		);
		const actionId = Object.entries(manifest.node).find(([, value]) => value.exportedName === "authenticate")?.[0];
		assert.ok(actionId, "dev server must compile authenticate action");
		async function action(path, values) {
			const form = new FormData();
			for (const [key, value] of Object.entries(values)) form.set(key, value);
			const response = await fetch(`${origin}${path}`, {
				method: "POST",
				headers: {
					"Next-Action": actionId,
					Origin: origin,
					Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ")
				},
				body: await encodeReply([{ message: "" }, form]),
				redirect: "manual"
			});
			for (const cookie of response.headers.getSetCookie()) {
				const [pair] = cookie.split(";");
				const index = pair.indexOf("=");
				jar.set(pair.slice(0, index), pair.slice(index + 1));
			}
			return { response, body: await response.text() };
		}
		async function code(subject) {
			for (let attempt = 0; attempt < 20; attempt++) {
				const listing = await fetch(`${mailbox}/api/v1/messages`).then(response => response.json());
				const message = listing.messages.find(
					message =>
						message.Subject.toLowerCase().includes(subject) && message.To.some(to => to.Address === email)
				);
				if (message) {
					const detail = await fetch(`${mailbox}/api/v1/message/${message.ID}`).then(response =>
						response.json()
					);
					const match = `${detail.Text} ${detail.HTML}`.match(/\b(\d{6})\b/);
					assert.ok(match, "local email templates must display the six-digit Token");
					return match[1];
				}
				await new Promise(resolve => setTimeout(resolve, 500));
			}
			assert.fail("Mailpit did not receive the synthetic account email");
		}
		const signup = await action("/sign-up", { intent: "sign-up", email, password, next: "/account" });
		assert.match(signup.response.headers.get("x-action-redirect") ?? "", /^\/verify\?next=/);
		assert.ok(!signup.response.headers.get("x-action-redirect").includes(email));
		const unconfirmed = await action("/sign-in", { intent: "sign-in", email, password });
		assert.match(unconfirmed.body, /Verify your email before signing in/);
		const cooldown = await action("/verify", { intent: "resend" });
		assert.match(cooldown.body, /Wait before requesting another code/);
		const confirmation = await code("verification");
		const invalid = await action("/verify", { intent: "verify", code: "000000", next: "/account" });
		assert.match(invalid.body, /invalid or expired/);
		const verified = await action("/verify", { intent: "verify", code: confirmation, next: "/account" });
		assert.match(verified.response.headers.get("x-action-redirect") ?? "", /^\/account/);
		jar.clear();
		const recovery = await action("/forgot-password", { intent: "forgot-password", email });
		assert.match(recovery.response.headers.get("x-action-redirect") ?? "", /^\/reset-password/);
		const recoveryCode = await code("reset");
		const samePassword = await action("/reset-password", {
			intent: "reset-password",
			code: recoveryCode,
			password,
			next: "/account"
		});
		assert.match(samePassword.body, /different from your current password/);
		assert.ok(jar.get("fm-recovery-user"));
		const validMarker = jar.get("fm-recovery-user");
		jar.set("fm-recovery-user", "00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002");
		const mismatchedUser = await action("/reset-password", {
			intent: "reset-password",
			code: "000000",
			password: nextPassword
		});
		assert.match(mismatchedUser.body, /invalid or expired/);
		jar.set(
			"fm-recovery-user",
			encodeURIComponent(`${decodeURIComponent(validMarker).split(":")[0]}:00000000-0000-4000-8000-000000000002`)
		);
		const mismatchedSession = await action("/reset-password", {
			intent: "reset-password",
			code: "000000",
			password: nextPassword
		});
		assert.match(mismatchedSession.body, /invalid or expired/);
		jar.set("fm-recovery-user", validMarker);
		const pendingEmail = jar.get("fm-recovery-email");
		jar.set("fm-recovery-email", "different-account%40example.com");
		const mismatchedEmail = await action("/reset-password", {
			intent: "reset-password",
			code: "000000",
			password: nextPassword
		});
		assert.match(mismatchedEmail.body, /invalid or expired/);
		jar.set("fm-recovery-email", pendingEmail);
		const reset = await action("/reset-password", {
			intent: "reset-password",
			code: recoveryCode,
			password: nextPassword,
			next: "/account"
		});
		assert.match(reset.response.headers.get("x-action-redirect") ?? "", /^\/account/);
		assert.equal(jar.get("fm-recovery-user"), "");
		jar.clear();
		const old = await action("/sign-in", { intent: "sign-in", email, password });
		assert.match(old.body, /email or password is incorrect/);
		const signedIn = await action("/sign-in", {
			intent: "sign-in",
			email,
			password: nextPassword,
			next: "https://evil.example"
		});
		// Next.js appends the redirect type to the header ("/o;push"); an external `next` falls back to /o.
		assert.match(signedIn.response.headers.get("x-action-redirect") ?? "", /^\/o([?;]|$)/);
	}
);
