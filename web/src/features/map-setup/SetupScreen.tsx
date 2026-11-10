"use client";
import { useEffect, useMemo, useState } from "react";

import { Button, ButtonLink } from "@/components/contour/Button";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { NotAvailable } from "@/components/shell/NotAvailable";
import { useLeaveGuard } from "@/features/shell/useLeaveGuard";
import { LeaveDialog } from "@/features/zones/LeaveDialog";
import { saveText } from "@/lib/download";

import { AcceptedBoundaryEditor } from "./AcceptedBoundaryEditor";
import { type Address } from "./api";
import { ImportReview } from "./ImportReview";
import { Intake } from "./Intake";
import { sourceDisposition } from "./model";
import { setupPlan } from "./plan";
import { ReviewPanel } from "./ReviewPanel";
import { SetupActions } from "./SetupActions";
import { SetupNotice } from "./SetupNotice";
import { useSetup } from "./useSetup";

type Step = "add-map" | "boundaries" | "review";
type Props = {
	readonly projectId: string;
	readonly siteId: string;
	readonly userId: string;
	readonly siteName: string;
	readonly siteHref: string;
	readonly expectedCurrent: string | null;
	readonly setupId?: string;
	readonly initialStep: Step;
	readonly formsUnavailable: boolean;
	readonly inventoryFormsIncomplete: boolean;
	readonly observationForms: readonly { code: string; name: string }[];
	readonly inventoryForms: readonly { code: string; name: string }[];
};
export function SetupScreen(props: Props) {
	const address = useMemo<Address>(
		() => ({ projectId: props.projectId, siteId: props.siteId, userId: props.userId }),
		[props.projectId, props.siteId, props.userId]
	);
	const state = useSetup(address, props.setupId);
	const { setup, content } = state;
	useEffect(() => {
		if (props.setupId !== undefined || setup?.state !== "draft") return;
		const canonical = `${props.siteHref}/map-setup/${setup.setup_id}/add-map`;
		if (window.location.pathname !== canonical) window.history.replaceState(null, "", canonical);
	}, [props.setupId, props.siteHref, setup?.setup_id, setup?.state]);
	const [requestedStep, setStep] = useState<Step>(props.initialStep);
	const step: Step =
		!setup || !content || sourceDisposition(setup.layers, content.assignments) > 0
			? "add-map"
			: requestedStep === "review" && (!content.outline || !content.zones.length)
				? "boundaries"
				: requestedStep;
	const prerequisiteMessage =
		requestedStep === step
			? null
			: step === "add-map"
				? "Review every imported feature before opening Set boundaries."
				: "Add a site outline and at least one observation zone before Review and publish.";
	const [pendingWork, setPendingWork] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [published, setPublished] = useState<number | null>(null);
	const guard = useLeaveGuard(state.dirty || state.busy || publishing || pendingWork);
	const recover = () => saveText(JSON.stringify(content, null, 2), "unsaved-map-setup.json", "application/json");
	const plan = useMemo(
		() => (setup && content ? setupPlan(props.siteName, setup.layers, content) : null),
		[setup, content, props.siteName]
	);
	async function go(next: Step) {
		if (!setup || !content) return;
		if (pendingWork) {
			state.setError("Finish or cancel the current drawing or source review before continuing.");
			return;
		}
		if (!(await state.flush())) return;
		if (next !== "add-map" && !plan) {
			state.setError(
				"This project has no local vector map features. Add local vector files or GeoJSON exports before continuing to boundaries."
			);
			return;
		}
		if (next !== "add-map" && sourceDisposition(setup.layers, content.assignments) > 0) {
			state.setError("Review every map feature before continuing to boundaries.");
			return;
		}
		if (next === "review" && (!content.outline || content.zones.length === 0)) {
			state.setError("Add the site outline and at least one observation zone before review.");
			return;
		}
		setStep(next);
		window.history.replaceState(null, "", `${props.siteHref}/map-setup/${setup.setup_id}/${next}`);
	}
	if (state.fenced)
		return (
			<Note title="Your signed-in account changed.">
				Open the site again with the account that owns this work. Previous account data has been cleared from
				this page.
			</Note>
		);
	if (state.loading) return <p role="status">Loading map setup…</p>;
	if (state.unavailable)
		return (
			<div className="flex flex-col gap-6">
				<PageHeader title={`${props.siteName} · Map setup`} />
				<NotAvailable
					title="Starting or resuming map setup"
					reason="This DECA Mark release cannot load unfinished map setups."
					instead="Ask the operator to finish the map-setup update before choosing project files."
				/>
			</div>
		);
	if (state.missing)
		return (
			<div className="flex flex-col gap-6">
				<PageHeader title={`${props.siteName} · Map setup`} />
				<Note title="This saved map setup is no longer available.">
					<p>Return to the site to check whether another manager published or discarded it.</p>
					<ButtonLink variant="primary" href={props.siteHref}>
						View site
					</ButtonLink>
				</Note>
			</div>
		);
	if (setup && setup.state !== "draft")
		return (
			<Note
				title={setup.state === "published" ? "This map setup was published." : "This map setup was discarded."}>
				<ButtonLink variant="primary" href={props.siteHref}>
					View site
				</ButtonLink>
			</Note>
		);
	return (
		<div className="flex flex-col gap-6">
			<PageHeader title={`${props.siteName} · Map setup`} />
			<nav aria-label="Map setup steps" className="flex flex-wrap gap-2">
				{(
					[
						["add-map", "Add map"],
						["boundaries", "Set boundaries"],
						["review", "Review and publish"]
					] as const
				).map(([value, label]) => (
					<Button
						key={value}
						variant="outline"
						aria-current={step === value ? "step" : undefined}
						disabled={!setup || state.busy || publishing}
						onClick={() => void go(value)}>
						{label}
					</Button>
				))}
			</nav>
			<p role="status" className="type-small text-ink-2">
				{published !== null
					? `Map version ${published} is published.`
					: state.busy
						? "Saving…"
						: state.dirty
							? "Changes not yet saved."
							: setup
								? "Draft saved. Observers cannot use it yet."
								: "Choose a project to start your map setup."}
			</p>
			<SetupNotice state={state} siteHref={props.siteHref} recover={recover} />
			{prerequisiteMessage && <Note title="Finish this step first.">{prerequisiteMessage}</Note>}
			{published !== null ? (
				<Note title={`Map version ${published} published.`}>
					<p>Observers can download this version in the app.</p>
					<ButtonLink variant="primary" href={props.siteHref}>
						View map
					</ButtonLink>
				</Note>
			) : (
				<>
					{(!setup || step === "add-map") && (
						<Intake
							onPending={setPendingWork}
							address={address}
							setup={setup}
							expectedCurrent={props.expectedCurrent}
							beforeRead={async () => {
								if (!setup) return null;
								if (!(await state.flush())) return false;
								return state.acknowledged();
							}}
							onImported={value => {
								state.accept(value);
								window.history.replaceState(
									null,
									"",
									`${props.siteHref}/map-setup/${value.setup_id}/add-map`
								);
							}}
						/>
					)}
					{setup && content && step === "add-map" && (
						<>
							<ImportReview
								disabled={pendingWork}
								setup={setup}
								content={content}
								siteName={props.siteName}
								onChange={state.change}
							/>
							<Button
								variant="primary"
								onClick={() => void go("boundaries")}
								disabled={state.busy || !plan}>
								Continue to boundaries
							</Button>
						</>
					)}
					{setup && content && step === "boundaries" && (
						<>
							<AcceptedBoundaryEditor
								acceptedContentEpoch={state.acceptedContentEpoch}
								layers={setup.layers}
								baseZoneIds={setup.base_zone_ids}
								content={content}
								onChange={state.change}
								onPending={setPendingWork}
							/>
							<Button variant="primary" onClick={() => void go("review")} disabled={state.busy}>
								Review map
							</Button>
						</>
					)}
					{setup && content && step === "review" && (
						<ReviewPanel
							address={address}
							setup={setup}
							content={content}
							state={state}
							siteHref={props.siteHref}
							observationForms={props.observationForms}
							inventoryForms={props.inventoryForms}
							formsUnavailable={props.formsUnavailable}
							inventoryFormsIncomplete={props.inventoryFormsIncomplete}
							onBusy={setPublishing}
							onPublished={setPublished}
						/>
					)}
					<SetupActions
						state={state}
						address={address}
						siteHref={props.siteHref}
						pendingWork={pendingWork}
						publishing={publishing}
						recover={recover}
						go={guard.go}
					/>
				</>
			)}
			<LeaveDialog
				leavingTo={guard.leavingTo}
				onStay={guard.stay}
				onLeave={guard.leave}
				closed={state.conflict}
				onSaveFile={recover}
				save={{
					busy: state.busy,
					unavailable: pendingWork
						? "Finish or cancel the current drawing or source review first."
						: state.conflict
							? "Resolve the saved version conflict first."
							: null,
					onSave: async () => {
						if (await state.flush()) guard.leave();
					}
				}}
			/>
		</div>
	);
}
