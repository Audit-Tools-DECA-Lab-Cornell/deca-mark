"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/contour/Button";
import { Note } from "@/components/contour/Note";

/** A record's map version that did not load, with Try again; the record and its facts are unaffected. */
export function MapRetry({ version }: { version: number }) {
	const router = useRouter();
	const [retrying, startRetry] = useTransition();

	return (
		<Note tone="attention" title={`We could not load map v${version} for this observation.`}>
			<span className="flex flex-col items-start gap-3">
				<span>The record and its zone are unchanged.</span>
				<Button
					variant="outline"
					size="sm"
					icon="rotate-cw"
					busy={retrying}
					busyLabel="Trying again…"
					onClick={() => startRetry(() => router.refresh())}>
					Try again
				</Button>
			</span>
		</Note>
	);
}
