import type { ReactNode } from "react";

import { AuthSplit } from "@/components/shell/AuthSplit";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { AccountChip } from "@/features/auth/AccountChip";
import { readViewer } from "@/features/auth/viewer";

/**
 * The invitation and join pages (Org 11, Org 12). They serve someone who is signed in and someone who
 * still has to sign in. When the sign-in is valid the header names the real account, with a way out for
 * the wrong person; otherwise it carries the Privacy link like the other public pages.
 */
export default async function JoinLayout({ children }: Readonly<{ children: ReactNode }>) {
	const { account } = await readViewer();
	return (
		<>
			<PublicHeader brandMarkOnlyOnPhones>{account ? <AccountChip account={account} /> : undefined}</PublicHeader>
			<main id="main" tabIndex={-1} className="flex flex-1 flex-col">
				<AuthSplit className="lg:justify-center">{children}</AuthSplit>
			</main>
		</>
	);
}
