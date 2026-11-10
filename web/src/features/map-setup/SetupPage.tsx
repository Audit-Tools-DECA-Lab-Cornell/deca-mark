import { notFound } from "next/navigation";

import { LoadFailure } from "@/components/shell/LoadFailure";
import { publishedVersions } from "@/features/packages/forms";
import { getFormDefinitions, getSite, getWorkspace, listForms, resolveProject } from "@/lib/api/workspace";
import { projectAbilities } from "@/lib/workspace/access";
import { settle } from "@/lib/workspace/result";

import { setupFormChoices } from "./form-choices";
import { SetupScreen } from "./SetupScreen";

type Params = { org: string; project: string; site: string; setup?: string; step?: string };
type FormChoice = { readonly code: string; readonly name: string };

export async function SetupPage({ params }: { readonly params: Promise<Params> }) {
	const { org, project, site, setup, step = "add-map" } = await params;
	const ref = await resolveProject(org, project);
	if (!ref) notFound();
	if (!projectAbilities(ref.role).manage)
		return (
			<LoadFailure
				failure={{
					code: "role_required",
					kind: "rejected",
					message: "Manager access is required to set up this map."
				}}
				what="map setup"
				noAccess="Only project managers can set up a map."
			/>
		);
	if (!["add-map", "boundaries", "review"].includes(step)) notFound();
	const [siteResult, forms, workspace] = await Promise.all([
		settle(getSite(ref.id, site)),
		settle(listForms(ref.id)),
		getWorkspace()
	]);
	if (!siteResult.ok) return <LoadFailure failure={siteResult.failure} what="this site" />;
	const user = workspace.account.userId;
	if (!user)
		return (
			<LoadFailure
				failure={{ code: "token_invalid", kind: "sign-in", message: "Sign in again to set up this map." }}
				what="map setup"
			/>
		);
	const published = publishedVersions(forms.ok ? forms.data : []);
	const formDefinitions = forms.ok
		? await getFormDefinitions(
				ref.id,
				published.map(form => form.code)
			)
		: { definitions: {}, missing: [] };
	const choices = setupFormChoices(published, formDefinitions.definitions);
	const label = (form: (typeof published)[number]): FormChoice => ({
		code: form.code,
		name: `${form.formName} · version ${form.version}`
	});
	const initialStep = step === "boundaries" ? "boundaries" : step === "review" ? "review" : "add-map";
	return (
		<SetupScreen
			projectId={ref.id}
			siteId={siteResult.data.site_id}
			userId={user}
			siteName={siteResult.data.name}
			siteHref={`/o/${org}/p/${project}/sites/${site}`}
			expectedCurrent={siteResult.data.current_package_id}
			setupId={setup}
			initialStep={initialStep}
			formsUnavailable={!forms.ok}
			inventoryFormsIncomplete={forms.ok && formDefinitions.missing.length > 0}
			observationForms={choices.observation.map(label)}
			inventoryForms={choices.inventory.map(label)}
		/>
	);
}
