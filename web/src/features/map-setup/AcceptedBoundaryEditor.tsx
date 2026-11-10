"use client";

import { BoundaryEditor, type BoundaryEditorProps } from "./BoundaryEditor";

type AcceptedBoundaryEditorProps = BoundaryEditorProps & Readonly<{ readonly acceptedContentEpoch: number }>;

/**
 * Remounts the complete boundary-editing tree whenever saved content replaces local content.
 * Save acknowledgements retain the epoch, so ordinary autosaves preserve undo and drawing state.
 */
export function AcceptedBoundaryEditor({ acceptedContentEpoch, ...editor }: AcceptedBoundaryEditorProps) {
	return <BoundaryEditor key={acceptedContentEpoch} {...editor} />;
}
