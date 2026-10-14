import { expect } from "@playwright/test";

import { loopbackOrigin } from "./manifest";

/** The local Mailpit inbox, where local Supabase Auth delivers its emails. */
const MAILPIT = loopbackOrigin(process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324", "Mailpit");

type Listing = { messages: { ID: string; Subject: string; To: { Address: string }[] }[] };

/** The six-digit code in the newest email to `email` whose subject contains `subject`. */
export async function codeFrom(email: string, subject: string): Promise<string> {
	let found = "";
	await expect
		.poll(
			async () => {
				const listing = (await fetch(`${MAILPIT}/api/v1/messages`).then(answer => answer.json())) as Listing;
				const message = listing.messages.find(
					item => item.Subject.includes(subject) && item.To.some(to => to.Address === email)
				);
				if (!message) return "";
				const detail = (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`).then(answer =>
					answer.json()
				)) as {
					Text: string;
					HTML: string;
				};
				found = /\b(\d{6})\b/.exec(`${detail.Text} ${detail.HTML}`)?.[1] ?? "";
				return found;
			},
			{ timeout: 20_000, message: `an email "${subject}" to ${email}` }
		)
		.toMatch(/^\d{6}$/);
	return found;
}
