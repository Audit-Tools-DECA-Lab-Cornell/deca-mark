"use client";
import { type ReactNode, useState } from "react";
import { z } from "zod";

import { Button, ButtonLink } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { Icon, type IconName } from "@/components/contour/Icon";
import { Island, IslandSection } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { Select } from "@/components/contour/Select";
import { Textarea } from "@/components/contour/Textarea";
import { MapFrame } from "@/components/map/MapFrame";
import { apiRequestError } from "@/lib/api/errors";
import { cx } from "@/lib/cx";
import { CHANGE_NOTE_MAX } from "@/lib/zones/geometry";

import { type Address, request } from "./api";
import { unavailableInventoryFormCode } from "./form-choices";
import { setupPlan } from "./plan";
import { type Content, type Setup, setupEtag } from "./schema";
import type { useSetup } from "./useSetup";
import { MAP_HEIGHT, WORKSPACE_GRID } from "./workspace";
const validationSchema = z.object({
	ready: z.boolean(),
	issues: z.array(z.object({ message: z.string().optional(), code: z.string().optional() }).passthrough())
});
const publishedSchema = z.object({ package: z.object({ package_version: z.number().int().positive() }) });
type Props = {
	readonly address: Address;
	readonly setup: Setup;
	readonly content: Content;
	readonly state: ReturnType<typeof useSetup>;
	readonly siteHref: string;
	readonly siteName: string;
	readonly footer: ReactNode;
	readonly formsUnavailable: boolean;
	readonly inventoryFormsIncomplete: boolean;
	readonly observationForms: readonly { code: string; name: string }[];
	readonly inventoryForms: readonly { code: string; name: string }[];
	readonly onBusy: (busy: boolean) => void;
	readonly onPublished: (version: number) => void;
};
export function ReviewPanel({
	address,
	setup,
	content,
	state,
	siteHref,
	siteName,
	footer,
	observationForms,
	inventoryForms,
	formsUnavailable,
	inventoryFormsIncomplete,
	onBusy,
	onPublished
}: Props) {
	const [publishing, setPublishing] = useState(false);
	const [requestId, setRequestId] = useState(() => crypto.randomUUID());
	const [checked, setChecked] = useState<{ key: string; etag: string } | null>(null);
	const key = JSON.stringify(content);
	const unavailableInventory = unavailableInventoryFormCode(content.inventory_form_version, inventoryForms);
	const includedFeatureCount = content.assignments.filter(item => item.role !== "leave_out").length;
	const leftOutFeatureCount = content.assignments.length - includedFeatureCount;
	const leftOutSources = setup.issues.filter(issue => content.confirmed_omissions.includes(issue.source_id));
	const openImportWarnings = setup.issues.filter(issue => !content.confirmed_omissions.includes(issue.source_id));
	const ready =
		unavailableInventory === null && checked?.key === key && checked.etag === setupEtag(setup) && !state.dirty;
	const plan = setupPlan(siteName, setup.layers, content);
	const unnamed = content.zones.filter(zone => !zone.zone_label.trim()).length;
	return (
		<div className={WORKSPACE_GRID}>
			<div className="lg:sticky lg:top-4">
				{plan && (
					<MapFrame
						site={plan}
						title={siteName}
						subtitle="The map observers will get"
						mapVersion="Draft"
						className={MAP_HEIGHT}
					/>
				)}
			</div>
			<div className="flex min-w-0 flex-col gap-6">
				<Island flush divided title={<span id="publish-heading">Review and publish</span>}>
					<IslandSection>
						<ul className="flex flex-col gap-3">
							<Line ok={content.outline !== null}>
								{content.outline ? "Site outline added" : "Site outline missing"} ·{" "}
								{content.zones.length} zones.
							</Line>
							{content.zones.length > 0 && (
								<Line ok={unnamed === 0} quiet>
									{unnamed === 0
										? content.zones.map(zone => zone.zone_label).join(", ")
										: `${unnamed} ${unnamed === 1 ? "zone has" : "zones have"} no name yet. Name ${unnamed === 1 ? "it" : "them"} in Zones.`}
								</Line>
							)}
							<Line ok>
								{includedFeatureCount} imported map{" "}
								{includedFeatureCount === 1 ? "feature" : "features"} included ·{" "}
								{leftOutFeatureCount + leftOutSources.length} left out.
							</Line>
							<Line ok quiet icon="info">
								{setup.expected_current_package_id
									? "The current published map stays available until this version is published."
									: "This will be the site’s first published map."}
							</Line>
						</ul>
						{openImportWarnings.length > 0 && (
							<Note tone="attention" title="Import warnings still open" className="mt-4">
								<ul className="mt-2 list-disc space-y-1 pl-5 type-small">
									{openImportWarnings.map(issue => (
										<li key={`${issue.source_id}-${issue.kind}`}>
											{issue.layer}: {issue.message}
										</li>
									))}
								</ul>
								<p className="mt-2 type-small">
									Return to Map layers to add the missing files or leave these sources out.
								</p>
							</Note>
						)}
						{leftOutSources.length > 0 && (
							<div className="mt-4">
								<h3 className="type-small font-semibold">Sources left out</h3>
								<ul className="mt-1 list-disc space-y-1 pl-5 type-small text-ink-2">
									{leftOutSources.map(issue => (
										<li key={issue.source_id}>
											{issue.layer}: {issue.message}
										</li>
									))}
								</ul>
							</div>
						)}
					</IslandSection>
					<IslandSection rule className="flex flex-col gap-5">
						<Field label="Published observation form" htmlFor="setup-form">
							<Select
								id="setup-form"
								disabled={formsUnavailable}
								value={content.form_version ?? ""}
								onChange={event => {
									state.change({ ...content, form_version: event.target.value || null });
									setChecked(null);
									setRequestId(crypto.randomUUID());
								}}>
								<option value="">Choose a published form</option>
								{observationForms.map(form => (
									<option key={form.code} value={form.code}>
										{form.name}
									</option>
								))}
							</Select>
						</Field>
						<Field label="Published inventory form (optional)" htmlFor="setup-inventory-form">
							<Select
								id="setup-inventory-form"
								disabled={formsUnavailable}
								value={content.inventory_form_version ?? ""}
								onChange={event => {
									state.change({ ...content, inventory_form_version: event.target.value || null });
									setChecked(null);
								}}>
								<option value="">Inventory off</option>
								{unavailableInventory !== null && (
									<option value={unavailableInventory}>Unavailable · {unavailableInventory}</option>
								)}
								{inventoryForms.map(form => (
									<option key={form.code} value={form.code}>
										{form.name}
									</option>
								))}
							</Select>
						</Field>
						<Field
							label="What changed"
							htmlFor="setup-change-note"
							optional
							hint="Recommended: what changed and why. This note appears with the published map version.">
							<Textarea
								id="setup-change-note"
								value={content.change_note}
								maxLength={CHANGE_NOTE_MAX}
								showCount
								rows={3}
								onChange={event => {
									state.change({ ...content, change_note: event.target.value });
									setChecked(null);
								}}
							/>
						</Field>
						{unavailableInventory !== null && (
							<Note tone="attention" title="The selected inventory form is unavailable.">
								<p>
									This setup still names {unavailableInventory}, but its published definition cannot
									be used for inventory. Turn Inventory off, choose another inventory form, or reload
									the forms before checking this map.
								</p>
								<div className="mt-3 flex flex-wrap gap-2">
									<Button
										variant="ink"
										size="sm"
										onClick={() => {
											state.change({ ...content, inventory_form_version: null });
											setChecked(null);
										}}>
										Turn Inventory off
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={async () => {
											if (await state.flush()) window.location.reload();
										}}>
										Reload forms
									</Button>
								</div>
							</Note>
						)}
						{formsUnavailable && (
							<Note tone="attention" title="Published form details could not be loaded.">
								<p>
									Your map setup is still saved. Reload the forms before checking or publishing this
									map.
								</p>
								<div className="mt-3 flex flex-wrap gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={async () => {
											if (await state.flush()) window.location.reload();
										}}>
										Reload forms
									</Button>
								</div>
							</Note>
						)}
						{!formsUnavailable && inventoryFormsIncomplete && (
							<Note tone="attention" title="Some inventory form details could not be loaded.">
								<p>
									Those forms remain available for observations, but they are not offered for
									inventory until their details can be checked.
								</p>
								<div className="mt-3 flex flex-wrap gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={async () => {
											if (await state.flush()) window.location.reload();
										}}>
										Reload form details
									</Button>
								</div>
							</Note>
						)}
						{!formsUnavailable && !observationForms.length && (
							<Note title="Publish an observation form before publishing this map.">
								<div className="mt-3 flex flex-wrap gap-2">
									<ButtonLink
										variant="outline"
										size="sm"
										href={`${siteHref.split("/sites/")[0]}/forms`}>
										Open forms
									</ButtonLink>
								</div>
							</Note>
						)}
					</IslandSection>
					<IslandSection rule className="flex flex-col gap-3">
						<p className="type-small text-ink-2">
							DECA Mark checks the saved map first. Once it is published, observers get it the next time
							they make this site ready offline in the app.
						</p>
						<div className="flex flex-wrap items-start gap-3">
							<Button
								variant="ink"
								disabled={
									formsUnavailable ||
									unavailableInventory !== null ||
									openImportWarnings.length > 0 ||
									state.busy ||
									publishing
								}
								disabledReason={
									unavailableInventory !== null
										? "Turn Inventory off, choose another inventory form, or reload forms before checking this map."
										: openImportWarnings.length > 0
											? "Add the missing files or leave those sources out in Map layers before checking this map."
											: undefined
								}
								onClick={async () => {
									if (!(await state.flush())) return;
									const saved = state.acknowledged();
									if (!saved) return;
									try {
										const value = validationSchema.parse(
											await request(address, `/${setup.setup_id}/validate`, {
												method: "POST",
												headers: { "If-Match": setupEtag(saved) }
											})
										);
										if (value.ready) {
											setChecked({ key, etag: setupEtag(saved) });
											setRequestId(crypto.randomUUID());
											state.setError(null);
										} else {
											setChecked(null);
											state.setError(
												value.issues
													.map(issue => issue.message ?? issue.code ?? "Check map boundaries")
													.join(". ")
											);
										}
									} catch (raised) {
										const failure = apiRequestError(raised);
										state.setError(failure.detail ?? failure.message);
									}
								}}>
								Check map
							</Button>
							<Button
								variant="primary"
								busy={publishing}
								busyLabel="Publishing…"
								disabled={
									formsUnavailable ||
									unavailableInventory !== null ||
									!ready ||
									state.busy ||
									state.conflict ||
									publishing
								}
								disabledReason={
									formsUnavailable
										? "Reload the published forms before checking and publishing this map."
										: unavailableInventory !== null
											? "Turn Inventory off, choose another inventory form, or reload forms before publishing."
											: !ready
												? "Check the saved map before publishing."
												: undefined
								}
								onClick={async () => {
									if (!checked) return;
									setPublishing(true);
									onBusy(true);
									try {
										const result = publishedSchema.parse(
											await request(address, `/${setup.setup_id}/publish`, {
												method: "POST",
												headers: { "If-Match": checked.etag },
												body: JSON.stringify({
													request_id: requestId,
													expected_current_package_id: setup.expected_current_package_id
												})
											})
										);
										state.setError(null);
										onPublished(result.package.package_version);
									} catch (raised) {
										const failure = apiRequestError(raised);
										if (failure.kind !== "retry") {
											setChecked(null);
											state.setError(failure.detail ?? failure.message);
											return;
										}
										state.setError(
											"We could not confirm publication. Press Publish map again to check the same request; it will not create another version."
										);
									} finally {
										setPublishing(false);
										onBusy(false);
									}
								}}>
								Publish map
							</Button>
						</div>
						{ready && (
							<p role="status" className="flex items-center gap-2 type-small font-semibold text-saved">
								<Icon name="check" size={16} className="shrink-0" />
								This saved map is ready to publish.
							</p>
						)}
					</IslandSection>
				</Island>
				{footer}
			</div>
		</div>
	);
}

function Line({
	ok,
	quiet = false,
	icon,
	children
}: {
	readonly ok: boolean;
	readonly quiet?: boolean;
	readonly icon?: IconName;
	readonly children: ReactNode;
}) {
	return (
		<li className="flex items-start gap-3">
			<Icon
				name={icon ?? (ok ? "check" : "triangle-alert")}
				size={18}
				className={cx("mt-0.5 shrink-0", icon ? "text-ink-2" : ok ? "text-saved" : "text-attention")}
			/>
			<span className={cx("min-w-0 [overflow-wrap:anywhere]", quiet ? "type-small text-ink-2" : "type-body")}>
				{children}
			</span>
		</li>
	);
}
