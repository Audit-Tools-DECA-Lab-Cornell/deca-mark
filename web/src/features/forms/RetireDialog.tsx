"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Note } from "@/components/contour/Note";
import { useToast } from "@/components/contour/Toast";
import { rejected } from "@/lib/action-rejection";
import { plural } from "@/lib/labels";

import { ActionNote } from "./ActionNote";
import { retireVersionAction } from "./actions";
import type { VersionRow } from "./model";
import type { FormActionFailure } from "./result";

/**
 * Retire: stops a published version being used for new map packages. The sites whose current package names
 * it are listed first, because the app refuses to download a site whose package names a retired form.
 */
export function RetireDialog({
	org,
	project,
	version
}: {
	org: string;
	project: string;
	version: Pick<VersionRow, "code" | "sites">;
}) {
	const router = useRouter();
	const toast = useToast();
	const [open, setOpen] = useState(false);
	const [failure, setFailure] = useState<FormActionFailure | null>(null);
	const [pending, start] = useTransition();

	function retire() {
		start(async () => {
			let result: Awaited<ReturnType<typeof retireVersionAction>>;
			try {
				result = await retireVersionAction({ org, project, version: version.code });
			} catch (error) {
				return setFailure(rejected(error, "reload", "Nothing was retired."));
			}
			if (result.status === "failed") return setFailure(result);
			setOpen(false);
			toast({ title: `${version.code} is retired`, description: "It can still be read.", tone: "saved" });
			router.refresh();
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={next => {
				setOpen(next);
				if (!next) setFailure(null);
			}}
			title={`Retire ${version.code}?`}
			description="A retired version cannot be named by a new map package. It stays readable, and records already collected with it still upload."
			trigger={
				<Button variant="danger" size="sm" icon="held" aria-label={`Retire ${version.code}`}>
					Retire
				</Button>
			}
			footer={
				<>
					<DialogClose asChild>
						<Button variant="outline">Keep it published</Button>
					</DialogClose>
					<Button variant="danger-solid" icon="held" busy={pending} busyLabel="Retiring…" onClick={retire}>
						Retire version
					</Button>
				</>
			}>
			{version.sites.length > 0 ? (
				<Note
					tone="attention"
					title={`${plural(version.sites.length, "site")} use${version.sites.length === 1 ? "s" : ""} ${version.code} now.`}>
					Observers cannot download {version.sites.map(site => site.name).join(", ")} until{" "}
					{version.sites.length === 1 ? "a new map package is" : "new map packages are"} prepared with a
					published form version. A phone that has already downloaded a site keeps working.
				</Note>
			) : (
				<p className="type-body text-ink">No site&apos;s current map package names {version.code}.</p>
			)}
			<ActionNote failure={failure} className="mt-4" />
		</Dialog>
	);
}
