import { expect, test } from "@playwright/test";

import { api, listProjectInvitations } from "./support/api";
import { authFile } from "./support/auth";
import { projectPath, runStamp } from "./support/manifest";
import { textWithValues } from "./support/ui";

/** Plan step 6: invite someone, see the link and the code once, then revoke the invitation. */

test.use({ storageState: authFile("manager") });

/** Join codes use this alphabet (backend services/invitations.py), shown with or without a separator. */
const CODE = /\b([0-9ABCDEFGHJKMNPQRSTVWXYZ]{4})[ -]?([0-9ABCDEFGHJKMNPQRSTVWXYZ]{4})\b/;

test("a manager invites someone, sees the link and code once, and revokes the invitation", async ({ page }) => {
	const email = `invitee-${runStamp().toLowerCase()}@fieldmaps.test`;
	await page.goto(projectPath("team"));
	await page.getByRole("button", { name: "Invite", exact: true }).first().click();

	const dialog = page.getByRole("dialog");
	await dialog.getByLabel(/email/i).fill(email);
	await dialog
		.getByRole("button", { name: /^(invite|create|send)/i })
		.last()
		.click();

	// Local delivery is disabled; the person must share the once-only link or code.
	await expect(dialog).toContainText("Email delivery is unavailable. Send the link or code yourself.");
	const shown = await textWithValues(dialog);
	expect(shown, "the invitation link").toMatch(/\/invite#t=[\w-]{20,}/);
	const code = CODE.exec(shown);
	expect(code, "the join code").not.toBeNull();

	// The code is a real one: the invitation it opens is this project's.
	const preview = await api<{ project_name?: string | null; role: string }>(
		"outsider",
		"POST",
		"/v1/invitations/preview",
		{ code: `${code?.[1]}${code?.[2]}` }
	);
	expect(preview.role).toBe("observer");

	await dialog
		.getByRole("button", { name: /^(done|close)$/i })
		.first()
		.click();
	await expect(dialog).toBeHidden();

	// Revoke it from the pending invitations.
	const row = page.getByRole("main").locator('tr, li, [role="row"]').filter({ hasText: email }).first();
	await expect(row).toBeVisible();
	await row.getByRole("button", { name: /^Revoke\b/ }).click();
	const confirm = page.getByRole("dialog");
	await confirm
		.getByRole("button", { name: /^Revoke\b/ })
		.last()
		.click();
	await expect(page.getByRole("main").getByText(email)).toHaveCount(0);

	await expect
		.poll(
			async () => {
				const invitation = (await listProjectInvitations()).find(item => item.email === email);
				return invitation === undefined || invitation.revoked_at !== null;
			},
			{ message: "the invitation is revoked", timeout: 10_000 }
		)
		.toBe(true);
});
