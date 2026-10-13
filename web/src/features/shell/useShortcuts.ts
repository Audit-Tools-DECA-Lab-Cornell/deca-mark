"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
	chordPending,
	endChord,
	isOverlayOpen,
	isTypingTarget,
	ORG_GO_KEYS,
	PAGE_SEARCH_SELECTOR,
	PROJECT_GO_KEYS,
	startChord
} from "@/lib/shortcuts";

import { ORG_SECTIONS, orgHref, PROJECT_SECTIONS, projectHref } from "./navigation";
import { guardedPush } from "./navigationGuard";
import { useShell } from "./ShellProvider";
import { useWorkspace } from "./WorkspaceProvider";

/**
 * The workspace keys (DESIGN §8): ⌘K or Ctrl K opens the palette anywhere; `g` then a key goes to a tab;
 * `?` lists the shortcuts; `/` focuses the page's search. Nothing but ⌘K fires while typing in a field
 * or while a dialog or menu is open.
 */
export function useShortcuts() {
	const router = useRouter();
	const { paletteOpen, setPaletteOpen, setShortcutsOpen } = useShell();
	const workspace = useWorkspace();

	// `g` chords reach the tabs of the organization and project on screen, when the person belongs there.
	const org = workspace.org?.slug;
	const project = workspace.project && workspace.project.role !== "observer" ? workspace.project.code : undefined;
	const managesOrg = workspace.orgAbilities.manage;
	const managesProject = workspace.projectAbilities.manage;

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.defaultPrevented || event.isComposing) return;
			const key = event.key;

			if ((event.metaKey || event.ctrlKey) && !event.altKey && key.toLowerCase() === "k") {
				const target = event.target as Element | null;
				const inPalette = Boolean(target?.closest?.("[cmdk-root]"));
				if (isTypingTarget(event.target) && !inPalette) return;
				event.preventDefault();
				setPaletteOpen(!paletteOpen);
				return;
			}

			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (isTypingTarget(event.target) || isOverlayOpen()) return;

			if (chordPending()) {
				endChord();
				if (!org) return;
				const segment = project ? PROJECT_GO_KEYS[key] : ORG_GO_KEYS[key];
				if (segment === undefined) return;
				const section = (project ? PROJECT_SECTIONS : ORG_SECTIONS).find(entry => entry.segment === segment);
				if (!section || (section.managersOnly && !(project ? managesProject : managesOrg))) return;
				event.preventDefault();
				guardedPush(router, project ? projectHref(org, project, segment) : orgHref(org, segment));
				return;
			}

			if (key === "g") {
				startChord();
				return;
			}
			if (key === "?") {
				event.preventDefault();
				setShortcutsOpen(true);
				return;
			}
			if (key === "/") {
				event.preventDefault();
				const search = document.querySelector<HTMLElement>(PAGE_SEARCH_SELECTOR);
				if (search) search.focus();
				else setPaletteOpen(true);
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [managesOrg, managesProject, org, paletteOpen, project, router, setPaletteOpen, setShortcutsOpen]);
}

/** Mounts the workspace keys. */
export function ShellKeys() {
	useShortcuts();
	return null;
}
