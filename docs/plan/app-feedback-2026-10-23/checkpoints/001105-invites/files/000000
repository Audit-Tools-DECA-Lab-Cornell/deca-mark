"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { apiRequestError } from "@/lib/api/errors";
import { previewInvitation, redeemInvitation } from "@/lib/api/mutations";
import { getWorkspace } from "@/lib/api/workspace";
import { safeNext } from "@/lib/auth/navigation";
import { createClient } from "@/lib/supabase/server";

import {
	ALREADY_PROJECT_COPY,
	destinationFor,
	type InvitationDetails,
	type InviteCredential,
	type InviteProblem,
	inviteProblem,
	type JoinOutcome,
	placeOf,
	type PreviewOutcome
} from "./invitation";
import { cleanJoinCode } from "./params";

/**
 * What the invitation and join pages ask DECA Mark. The credential travels in the body of these calls,
 * never in an address: a link's secret came from the address fragment, and a join code is only typed.
 */

const SECRET = /^[A-Za-z0-9_-]{1,256}$/;
const CODE_LENGTH = 8;

const credentialSchema = z.union([
	z.strictObject({ token: z.string().regex(SECRET) }),
	z.strictObject({ code: z.string().max(64) })
]);

type Read = { ok: true; credential: InviteCredential } | { ok: false; problem: InviteProblem };

/** Exactly one of `{token}` or `{code}`, with a code cleaned the way the field cleans it. */
function readCredential(input: unknown): Read {
	const parsed = credentialSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			problem: { kind: "invalid", message: "This invitation could not be read. Open the link again." }
		};
	}
	if ("token" in parsed.data) return { ok: true, credential: { token: parsed.data.token } };
	const code = cleanJoinCode(parsed.data.code);
	if (code.length !== CODE_LENGTH)
		return { ok: false, problem: { kind: "invalid", message: "Enter all eight characters of the code." } };
	return { ok: true, credential: { code } };
}

function kindOf(credential: InviteCredential): "token" | "code" {
	return "token" in credential ? "token" : "code";
}

/**
 * Shows an invitation without using it: which organization and project it opens, the role it gives and
 * when it expires. Looking uses up nothing, but it shares a rate limit with joining.
 */
export async function previewInvite(input: InviteCredential): Promise<PreviewOutcome> {
	const read = readCredential(input);
	if (!read.ok) return { status: "failed", problem: read.problem };
	try {
		const preview = await previewInvitation(read.credential);
		return {
			status: "ready",
			invitation: {
				organization: preview.organization_name,
				project: preview.project_name,
				role: preview.role,
				expiresAt: preview.expires_at
			}
		};
	} catch (error) {
		return {
			status: "failed",
			problem: inviteProblem(apiRequestError(error), { step: "preview", credential: kindOf(read.credential) })
		};
	}
}

/**
 * Joins with the invitation and says where to go next. The workspace is read again afterwards, so the
 * new project is in it, and the `/o` layout is refreshed for everything that shows the person's places.
 * `names` are the organization and project the person was shown: if joining fails because they are
 * already a member, they say where that is.
 */
export async function redeemInvite(
	input: InviteCredential,
	names: Pick<InvitationDetails, "organization" | "project">
): Promise<JoinOutcome> {
	const read = readCredential(input);
	if (!read.ok) return { status: "failed", problem: read.problem };
	try {
		const redeemed = await redeemInvitation(read.credential);
		revalidatePath("/o", "layout");
		const workspace = await getWorkspace();
		return { status: "joined", path: destinationFor(redeemed, workspace), role: redeemed.role };
	} catch (error) {
		const problem = inviteProblem(apiRequestError(error), { step: "redeem", credential: kindOf(read.credential) });
		if (problem.kind !== "already-member") return { status: "failed", problem };
		// Only an explicit duplicate refusal supports the already-member recovery path.
		// A generic invalid reply can also mean the invited email does not match.
		const place = placeOf(await getWorkspace(), names);
		if (place)
			return {
				status: "failed",
				problem: { kind: "already-member", message: ALREADY_PROJECT_COPY, path: place }
			};
		return { status: "failed", problem: problem.kind === "already-member" ? { ...problem, path: "/o" } : problem };
	}
}

/**
 * "Not you?" on the invitation and join pages: signs out and returns to sign in, which comes back to the
 * same page once the right person is signed in. The link's secret stays in this tab until then.
 */
export async function switchAccount(form: FormData): Promise<void> {
	const next = safeNext(form.get("next"));
	const supabase = await createClient();
	const { error } = await supabase.auth.signOut();
	if (error) throw error;
	const store = await cookies();
	for (const name of ["fm-verify-email", "fm-recovery-email", "fm-recovery-user", "fm-email-sent"])
		store.delete(name);
	redirect(`/sign-in?next=${encodeURIComponent(next)}`);
}
