import type { Metadata } from "next";

import { ButtonLink } from "@/components/contour/Button";
import { Island } from "@/components/contour/Island";
import { PAGE_TITLE_ID } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { AppHeader } from "@/components/shell/AppHeader";
import { ShellMain } from "@/components/shell/ShellMain";
import { AccessIsland } from "@/features/account/AccessIsland";
import { DeleteAccount } from "@/features/account/DeleteAccount";
import { ProfileForm } from "@/features/account/ProfileForm";
import { SecurityIsland } from "@/features/account/SecurityIsland";
import { avatarInitials, type Identity, personName, possibleBlockers } from "@/features/account/view";
import { ApiError } from "@/lib/api/errors";
import { getMe } from "@/lib/api/workspace";
import { stateOf } from "@/lib/contour";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account", robots: { index: false, follow: false } };

/** "DECA Lab (Admin)": a membership as the deletion review lists it. */
function memberships(identity: Identity) {
	const label = (name: string, role: Parameters<typeof stateOf<"role">>[1]) =>
		`${name} (${stateOf("role", role).label})`;
	return {
		organizations: identity.organization_memberships.map(org => label(org.name, org.role)),
		projects: identity.project_memberships.map(project =>
			label(project.name, project.is_training ? "practice" : project.role)
		)
	};
}

/**
 * The account page (org-05): the signed-in user from Supabase Auth and their profile and memberships from
 * GET /v1/me (the same read the workspace header uses). Edit profile saves with PATCH /v1/me; Delete
 * account calls DELETE /v1/me. Outside an organization, the header has no switchers.
 */
export default async function AccountPage() {
	const { claims } = await requireUser();
	const email = typeof claims.email === "string" && claims.email ? claims.email : undefined;
	const { identity, error } = await getMe().then(
		identity => ({ identity, error: null }),
		(error: unknown) => {
			if (!(error instanceof ApiError)) throw error;
			return { identity: null, error };
		}
	);
	const name = personName(identity, email);
	const initials = avatarInitials(identity, email);

	return (
		<>
			<AppHeader />
			<ShellMain>
				<header className="flex items-center gap-5">
					<span
						aria-hidden="true"
						className="inline-flex size-19 shrink-0 items-center justify-center rounded-pill bg-ink type-section text-on-ink">
						{initials}
					</span>
					<div className="min-w-0">
						<h1 id={PAGE_TITLE_ID} tabIndex={-1} className="type-page text-ink sm:type-auth">
							Account
						</h1>
						<p className="mt-1 type-body text-ink-2 wrap-anywhere lg:type-lead">
							{name}
							{email && email !== name && <> · {email}</>}
						</p>
					</div>
				</header>
				<div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,3fr)]">
					<div className="flex min-w-0 flex-col gap-6">
						{identity ? (
							<>
								<ProfileForm
									displayName={identity.profile.display_name}
									initials={identity.profile.observer_initials}
									locale={identity.profile.locale}
									email={email}
								/>
								<AccessIsland identity={identity} />
							</>
						) : (
							<Island title="Profile" flush>
								<ScreenState
									kind="error"
									headingLevel={3}
									title="We could not load your account"
									body={`Nothing was changed. ${error?.message ?? ""}`}
									actions={
										error?.kind === "sign-in" ? (
											<ButtonLink
												variant="ink"
												icon="arrow-right"
												href="/sign-in?next=%2Faccount">
												Sign in again
											</ButtonLink>
										) : (
											<ButtonLink variant="ink" icon="rotate-cw" href="/account">
												Try again
											</ButtonLink>
										)
									}
								/>
							</Island>
						)}
					</div>
					<div className="flex min-w-0 flex-col gap-6">
						<SecurityIsland email={email} />
						{identity && (
							<DeleteAccount
								accountId={claims.sub}
								{...memberships(identity)}
								blockers={possibleBlockers(identity)}
							/>
						)}
					</div>
				</div>
			</ShellMain>
		</>
	);
}
