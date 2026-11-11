"use client";

import { OutlineStep, type OutlineStepProps } from "./OutlineStep";
import { ZonesStep, type ZonesStepProps } from "./ZonesStep";

type Accepted = Readonly<{ readonly acceptedContentEpoch: number }>;

/**
 * Remount a geometry-editing step whenever saved content replaces local content. Save acknowledgements
 * keep the epoch, so ordinary autosaves preserve undo and drawing state; an accepted import or conflict
 * resolution starts each editor again from the saved shapes, before it can report stale ones.
 */
export function AcceptedOutlineStep({ acceptedContentEpoch, ...step }: OutlineStepProps & Accepted) {
	return <OutlineStep key={acceptedContentEpoch} {...step} />;
}

export function AcceptedZonesStep({ acceptedContentEpoch, ...step }: ZonesStepProps & Accepted) {
	return <ZonesStep key={acceptedContentEpoch} {...step} />;
}
