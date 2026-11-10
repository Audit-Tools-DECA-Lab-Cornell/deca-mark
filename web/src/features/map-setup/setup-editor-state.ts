import type { Content, Setup } from "./schema";

export type SetupEditorState = Readonly<{
	readonly setup: Setup | null;
	readonly content: Content | null;
	readonly acceptedContentEpoch: number;
}>;

export type SetupEditorAction =
	| Readonly<{ readonly type: "accept"; readonly setup: Setup }>
	| Readonly<{ readonly type: "acknowledge"; readonly setup: Setup }>
	| Readonly<{ readonly type: "change"; readonly content: Content }>
	| Readonly<{ readonly type: "clear" }>;

/**
 * Keeps accepted-content replacement separate from ordinary save acknowledgements.
 * Only `accept` advances the epoch that remounts every geometry editor with saved content.
 */
export function reduceSetupEditorState(state: SetupEditorState, action: SetupEditorAction): SetupEditorState {
	switch (action.type) {
		case "accept":
			return {
				setup: action.setup,
				content: action.setup.content,
				acceptedContentEpoch: state.acceptedContentEpoch + 1
			};
		case "acknowledge":
			return { ...state, setup: action.setup };
		case "change":
			return { ...state, content: action.content };
		case "clear":
			return { ...state, setup: null, content: null };
		default: {
			const unreachable: never = action;
			return unreachable;
		}
	}
}
