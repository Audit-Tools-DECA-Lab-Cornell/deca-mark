"use client";
import { useEffect, useMemo, useState } from "react";

import { Button, ButtonLink } from "@/components/contour/Button";
import { Icon } from "@/components/contour/Icon";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { StepBar } from "@/components/contour/StepBar";
import { NotAvailable } from "@/components/shell/NotAvailable";
import { useLeaveGuard } from "@/features/shell/useLeaveGuard";
import { LeaveDialog } from "@/features/zones/LeaveDialog";
import { cx } from "@/lib/cx";
import { saveText } from "@/lib/download";

import { AcceptedOutlineStep, AcceptedZonesStep } from "./AcceptedSteps";
import { type Address } from "./api";
import { Intake } from "./Intake";
import { LayersStep } from "./LayersStep";
import { setupPlan } from "./plan";
import { ReviewPanel } from "./ReviewPanel";
import { SetupActions } from "./SetupActions";
import { SetupNotice } from "./SetupNotice";
import {
	finishedSteps,
	nextStep,
	previousStep,
	resolveStep,
	type Step,
	stepBlockers,
	type StepInput,
	STEPS
} from "./steps";
import { useSetup } from "./useSetup";

type Props = {
	readonly projectId: string;
	readonly siteId: string;
	readonly userId: string;
	readonly siteName: string;
	readonly siteHref: string;
	readonly sitesHref: string;
	readonly expectedCurrent: string | null;
	readonly setupId?: string;
	readonly initialStep: Step;
	readonly formsUnavailable: boolean;
	readonly inventoryFormsIncomplete: boolean;
	readonly observationForms: readonly { code: string; name: string }[];
	readonly inventoryForms: readonly { code: string; name: string }[];
};

const CONTINUE: Record<Step, string> = {
	"add-map": "Continue to site outline",
	outline: "Continue to zones",
	zones: "Review map",
	review: ""
};

/**
 * Map setup for one site: choose a QGIS project, say what its layers are, check or draw the site outline
 * and the observation zones, then publish. The header, the steps and the save state stay put while the
 * step below them changes; every step puts the map beside the task it serves.
 */
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
	const plan = useMemo(
		() => (setup && content ? setupPlan(props.siteName, setup.layers, content) : null),
		[setup, content, props.siteName]
	);
	const input = useMemo<StepInput | null>(
		() => (setup && content ? { layers: setup.layers, content, drawable: plan !== null } : null),
		[setup, content, plan]
	);
	const blockers = stepBlockers(input);
	const step = resolveStep(requestedStep, blockers);
	// A link to a later step than the draft allows opens the step that is ready, and says what is missing.
	const prerequisiteMessage =
		requestedStep === step ? null : STEPS.map(item => blockers[item.key]).find(reason => reason !== null);
	const [pendingWork, setPendingWork] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [published, setPublished] = useState<number | null>(null);
	const guard = useLeaveGuard(state.dirty || state.busy || publishing || pendingWork);
	const recover = () => saveText(JSON.stringify(content, null, 2), "unsaved-map-setup.json", "application/json");
	async function go(next: Step) {
		if (!setup || !content) return;
		if (pendingWork) {
			state.setError("Finish or cancel the drawing or file review you have open before changing step.");
			return;
		}
		if (!(await state.flush())) return;
		const blocked = blockers[next];
		if (blocked) {
			state.setError(blocked);
			return;
		}
		setStep(next);
		window.history.replaceState(null, "", `${props.siteHref}/map-setup/${setup.setup_id}/${next}`);
		window.scrollTo({ top: 0 });
	}
	const title = `${props.siteName} · Map setup`;
	const breadcrumbs = [
		{ label: "Sites", href: props.sitesHref },
		{ label: props.siteName, href: props.siteHref },
		{ label: "Map setup" }
	];
	if (state.fenced)
		return (
			<Note title="Your signed-in account changed.">
				Open the site again with the account that owns this work. Previous account data has been cleared from
				this page.
			</Note>
		);
	if (state.loading)
		return (
			<div className="flex flex-col gap-6">
				<PageHeader breadcrumbs={breadcrumbs} title={title} />
				<p role="status" className="type-body text-ink-2">
					Loading map setup…
				</p>
			</div>
		);
	if (state.unavailable)
		return (
			<div className="flex flex-col gap-6">
				<PageHeader breadcrumbs={breadcrumbs} title={title} />
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
				<PageHeader breadcrumbs={breadcrumbs} title={title} />
				<Note title="This saved map setup is no longer available.">
					<p>Return to the site to check whether another manager published or discarded it.</p>
					<div className="mt-3">
						<ButtonLink variant="primary" href={props.siteHref}>
							View site
						</ButtonLink>
					</div>
				</Note>
			</div>
		);
	if (setup && setup.state !== "draft")
		return (
			<div className="flex flex-col gap-6">
				<PageHeader breadcrumbs={breadcrumbs} title={title} />
				<Note
					title={
						setup.state === "published" ? "This map setup was published." : "This map setup was discarded."
					}>
					<div className="mt-3">
						<ButtonLink variant="primary" href={props.siteHref}>
							View site
						</ButtonLink>
					</div>
				</Note>
			</div>
		);
	const tone = published !== null || (setup && !state.busy && !state.dirty) ? "saved" : "waiting";
	const next = nextStep(step);
	const back = previousStep(step);
	const footer = (
		<div className="flex flex-wrap items-start justify-between gap-3">
			{back ? (
				<Button
					variant="outline"
					icon="chevron-left"
					disabled={state.busy || publishing}
					onClick={() => void go(back)}>
					Back
				</Button>
			) : (
				<span />
			)}
			{next && (
				<Button
					variant="primary"
					iconRight="arrow-right"
					disabled={state.busy || blockers[next] !== null}
					disabledReason={blockers[next] ?? undefined}
					onClick={() => void go(next)}>
					{CONTINUE[step]}
				</Button>
			)}
		</div>
	);
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				breadcrumbs={breadcrumbs}
				title={title}
				actions={
					published === null && setup ? (
						<SetupActions
							state={state}
							address={address}
							siteHref={props.siteHref}
							siteName={props.siteName}
							hasPublishedMap={props.expectedCurrent !== null}
							pendingWork={pendingWork}
							publishing={publishing}
							recover={recover}
							go={guard.go}
						/>
					) : undefined
				}
			/>
			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
				<StepBar
					label="Map setup steps"
					steps={STEPS.map(item => ({ key: item.key, label: item.label }))}
					current={published !== null ? "" : step}
					done={published !== null ? STEPS.map(item => item.key) : finishedSteps(input)}
					reachable={STEPS.filter(item => blockers[item.key] === null).map(item => item.key)}
					disabled={!setup || state.busy || publishing || published !== null}
					onSelect={key => {
						const target = STEPS.find(item => item.key === key)?.key;
						if (target && target !== step) void go(target);
					}}
					className="lg:min-w-0 lg:flex-1"
				/>
				<p
					role="status"
					className={cx(
						"flex items-center gap-2 type-small lg:shrink-0",
						tone === "saved" ? "text-ink-2" : "text-ink"
					)}>
					{setup && (
						<Icon
							name={tone === "saved" ? "check" : "clock"}
							size={16}
							className={cx("shrink-0", tone === "saved" ? "text-saved" : "text-waiting")}
						/>
					)}
					{published !== null
						? `Map version ${published} is published.`
						: state.busy
							? "Saving…"
							: state.dirty
								? "Changes not yet saved."
								: setup
									? "Draft saved. Observers cannot use it yet."
									: props.expectedCurrent
										? "Observers keep the current map until you publish a new one."
										: "Nothing is saved until a project has been read."}
				</p>
			</div>
			<SetupNotice state={state} siteHref={props.siteHref} recover={recover} />
			{prerequisiteMessage && published === null && (
				<Note title="Finish this step first.">{prerequisiteMessage}</Note>
			)}
			{published !== null ? (
				<Note tone="saved" title={`Map version ${published} published.`}>
					<p>
						Observers get this version the next time they make {props.siteName} ready offline in the DECA
						Mark app.
					</p>
					<div className="mt-3">
						<ButtonLink variant="primary" href={props.siteHref}>
							View map
						</ButtonLink>
					</div>
				</Note>
			) : (
				<>
					{(() => {
						const intake = (
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
						);
						if (!setup || !content) return intake;
						if (step !== "add-map") return null;
						return (
							<LayersStep
								disabled={pendingWork}
								setup={setup}
								content={content}
								siteName={props.siteName}
								onChange={state.change}
								files={intake}
								footer={footer}
							/>
						);
					})()}
					{setup && content && step === "outline" && (
						<AcceptedOutlineStep
							acceptedContentEpoch={state.acceptedContentEpoch}
							layers={setup.layers}
							content={content}
							onChange={state.change}
							onPending={setPendingWork}
							onChooseImported={() => void go("add-map")}
							footer={footer}
						/>
					)}
					{setup && content && step === "zones" && (
						<AcceptedZonesStep
							acceptedContentEpoch={state.acceptedContentEpoch}
							layers={setup.layers}
							baseZoneIds={setup.base_zone_ids}
							content={content}
							onChange={state.change}
							onPending={setPendingWork}
							footer={footer}
						/>
					)}
					{setup && content && step === "review" && (
						<ReviewPanel
							address={address}
							setup={setup}
							content={content}
							state={state}
							siteHref={props.siteHref}
							siteName={props.siteName}
							footer={footer}
							observationForms={props.observationForms}
							inventoryForms={props.inventoryForms}
							formsUnavailable={props.formsUnavailable}
							inventoryFormsIncomplete={props.inventoryFormsIncomplete}
							onBusy={setPublishing}
							onPublished={setPublished}
						/>
					)}
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
						? "Finish or cancel the drawing or file review you have open first."
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
