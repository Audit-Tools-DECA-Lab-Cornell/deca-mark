"use client";
import { useState } from "react";
import { z } from "zod";

import { Button, ButtonLink } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { Note } from "@/components/contour/Note";
import { Select } from "@/components/contour/Select";
import { Textarea } from "@/components/contour/Textarea";
import { apiRequestError } from "@/lib/api/errors";
import { CHANGE_NOTE_MAX } from "@/lib/zones/geometry";

import { type Address, request } from "./api";
import { unavailableInventoryFormCode } from "./form-choices";
import { type Content, type Setup, setupEtag } from "./schema";
import type { useSetup } from "./useSetup";
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
	return (
		<section className="flex flex-col gap-4">
			<h2 className="type-heading">Review and publish</h2>
			<p className="type-body">
				{content.outline ? "Site outline added" : "Site outline missing"} · {content.zones.length} zones.{" "}
				{setup.expected_current_package_id
					? "The current published map stays available until this version is published."
					: "This will be the site’s first published map."}
			</p>
			<p className="type-small text-ink-2">
				{includedFeatureCount} imported map {includedFeatureCount === 1 ? "feature" : "features"} included ·{" "}
				{leftOutFeatureCount + leftOutSources.length} features or sources left out.
			</p>
			{openImportWarnings.length > 0 && (
				<div>
					<h3 className="type-body font-semibold">Import warnings still open</h3>
					<ul className="mt-2 list-disc space-y-1 pl-5 type-small">
						{openImportWarnings.map(issue => (
							<li key={`${issue.source_id}-${issue.kind}`}>
								{issue.layer}: {issue.message}
							</li>
						))}
					</ul>
					<p className="mt-2 type-small text-ink-2">
						Return to Add map to leave these sources out, or add the missing local files, before publishing.
					</p>
				</div>
			)}
			{leftOutSources.length > 0 && (
				<div>
					<h3 className="type-body font-semibold">Sources left out</h3>
					<ul className="mt-2 list-disc space-y-1 pl-5 type-small">
						{leftOutSources.map(issue => (
							<li key={issue.source_id}>
								{issue.layer}: {issue.message}
							</li>
						))}
					</ul>
				</div>
			)}
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
						This setup still names {unavailableInventory}, but its published definition cannot be used for
						inventory. Turn Inventory off, choose another inventory form, or reload the forms before
						checking this map.
					</p>
					<Button
						variant="ink"
						onClick={() => {
							state.change({ ...content, inventory_form_version: null });
							setChecked(null);
						}}>
						Turn Inventory off
					</Button>
					<Button
						variant="outline"
						onClick={async () => {
							if (await state.flush()) window.location.reload();
						}}>
						Reload forms
					</Button>
				</Note>
			)}
			{formsUnavailable && (
				<Note tone="attention" title="Published form details could not be loaded.">
					<p>Your map setup is still saved. Reload the forms before checking or publishing this map.</p>
					<Button
						variant="outline"
						onClick={async () => {
							if (await state.flush()) window.location.reload();
						}}>
						Reload forms
					</Button>
				</Note>
			)}
			{!formsUnavailable && inventoryFormsIncomplete && (
				<Note tone="attention" title="Some inventory form details could not be loaded.">
					<p>
						Those forms remain available for observations, but they are not offered for inventory until
						their details can be checked.
					</p>
					<Button
						variant="outline"
						onClick={async () => {
							if (await state.flush()) window.location.reload();
						}}>
						Reload form details
					</Button>
				</Note>
			)}
			{!formsUnavailable && !observationForms.length && (
				<Note title="Publish an observation form before publishing this map.">
					<ButtonLink variant="outline" href={`${siteHref.split("/sites/")[0]}/forms`}>
						Open forms
					</ButtonLink>
				</Note>
			)}
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
							? "Resolve or leave out the open import warnings on Add map before checking this map."
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
			{ready && <p role="status">This saved map is ready to publish.</p>}
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
		</section>
	);
}
