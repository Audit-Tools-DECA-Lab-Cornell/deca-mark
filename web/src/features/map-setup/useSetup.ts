"use client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { apiRequestError } from "@/lib/api/errors";
import { createClient } from "@/lib/supabase/client";

import { type Address, loadSetup, saveSetup } from "./api";
import { classifySetupLoadFailure } from "./model";
import { drainSaves } from "./saving";
import { type Content, contentSchema, type Setup } from "./schema";
import { reduceSetupEditorState } from "./setup-editor-state";

export function useSetup(address: Address, id?: string) {
	const [{ setup, content, acceptedContentEpoch }, dispatchEditor] = useReducer(reduceSetupEditorState, {
		setup: null,
		content: null,
		acceptedContentEpoch: 0
	});
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [fenced, setFenced] = useState(false);
	const [conflict, setConflict] = useState(false);
	const [unavailable, setUnavailable] = useState(false);
	const [missing, setMissing] = useState(false);
	const saved = useRef<Setup | null>(null);
	const local = useRef<Content | null>(null);
	const inflight = useRef<Promise<boolean> | null>(null);
	const alive = useRef(true);
	const accept = useCallback((value: Setup) => {
		saved.current = value;
		local.current = value.content;
		dispatchEditor({ type: "accept", setup: value });
		setError(null);
	}, []);
	const change = useCallback((value: Content) => {
		const normalized = contentSchema.parse(value);
		local.current = normalized;
		dispatchEditor({ type: "change", content: normalized });
	}, []);
	useEffect(() => {
		alive.current = true;
		let current = true;
		loadSetup(address, id)
			.then(value => {
				if (current && alive.current) {
					if (value) accept(value);
					setUnavailable(false);
					setMissing(false);
					setLoading(false);
				}
			})
			.catch(raised => {
				if (current) {
					const failure = apiRequestError(raised);
					const disposition = classifySetupLoadFailure(failure, id);
					if (disposition === "capability-unavailable") {
						setUnavailable(true);
						setMissing(false);
						setError(null);
					} else if (disposition === "setup-missing") {
						setUnavailable(false);
						setMissing(true);
						setError(null);
					} else {
						setUnavailable(false);
						setMissing(false);
						setError("The map setup could not be loaded. Try again.");
					}
					setLoading(false);
				}
			});
		return () => {
			current = false;
		};
	}, [address, id, accept]);
	useEffect(() => {
		const client = createClient();
		const { data } = client.auth.onAuthStateChange((event, session) => {
			if (event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "TOKEN_REFRESHED") return;
			if (!session || session.user.id !== address.userId) {
				alive.current = false;
				saved.current = null;
				local.current = null;
				dispatchEditor({ type: "clear" });
				setFenced(true);
			}
		});
		return () => {
			alive.current = false;
			data.subscription.unsubscribe();
		};
	}, [address.userId]);
	const saveOne = useCallback(async (): Promise<boolean> => {
		if (inflight.current) return inflight.current;
		const base = saved.current;
		const snapshot = local.current;
		if (!base || !snapshot || !alive.current || conflict) return false;
		if (JSON.stringify(base.content) === JSON.stringify(snapshot)) return true;
		setBusy(true);
		setError(null);
		const work = (async () => {
			try {
				const value = await saveSetup(address, base, snapshot);
				if (!alive.current) return false;
				saved.current = value;
				dispatchEditor({ type: "acknowledge", setup: value });
				return true;
			} catch (raised) {
				if (!alive.current) return false;
				const failure = apiRequestError(raised);
				if (failure.code === "revision_conflict" || failure.code === "publication_conflict") {
					setConflict(true);
					setError(
						"Someone changed this map setup. Your changes are still here. Open the saved version to compare before continuing."
					);
					return false;
				}
				if (failure.kind === "rejected" || failure.kind === "sign-in") {
					setError(`Your changes were not saved. ${failure.detail ?? failure.message}`);
					return false;
				}
				try {
					const read = await loadSetup(address, base.setup_id);
					if (!alive.current) return false;
					if (read && JSON.stringify(read.content) === JSON.stringify(snapshot)) {
						saved.current = read;
						dispatchEditor({ type: "acknowledge", setup: read });
						return true;
					}
				} catch {
					/* A failed read cannot confirm an earlier save. */
				}
				setError(
					"We could not confirm the save. Keep this page open and try again. Your changes are still here."
				);
				return false;
			} finally {
				inflight.current = null;
				setBusy(false);
			}
		})();
		inflight.current = work;
		return work;
	}, [address, conflict]);
	const flush = useCallback(async () => {
		if (!alive.current || conflict || !saved.current || !local.current) return false;
		return drainSaves(saveOne, () => JSON.stringify(saved.current?.content) === JSON.stringify(local.current));
	}, [saveOne, conflict]);

	const dirty = !!setup && !!content && JSON.stringify(setup.content) !== JSON.stringify(content);
	useEffect(() => {
		if (!dirty || busy || conflict || error || fenced) return;
		const timer = setTimeout(() => void flush(), 1500);
		return () => clearTimeout(timer);
	}, [dirty, content, busy, conflict, error, fenced, flush]);
	useEffect(() => {
		if (!dirty || conflict || error || fenced) return;
		const timer = setTimeout(() => void flush(), 10000);
		return () => clearTimeout(timer);
	}, [dirty, conflict, error, fenced, flush]);

	const resolveConflict = async (choice: "saved" | "mine") => {
		const snapshot = local.current;
		const base = saved.current;
		if (!base || !snapshot || !alive.current) return;
		setBusy(true);
		try {
			const latest = await loadSetup(address, base.setup_id);
			if (!latest || !alive.current) return;
			if (choice === "saved") {
				accept(latest);
				setConflict(false);
				return;
			}
			if (latest.content.import_generation !== snapshot.import_generation) {
				setError(
					"The source map changed. Open the saved version and review its sources before bringing your boundaries across."
				);
				return;
			}
			const confirmed = await saveSetup(address, latest, snapshot);
			if (!alive.current) return;
			saved.current = confirmed;
			dispatchEditor({ type: "acknowledge", setup: confirmed });
			setError(null);
			setConflict(false);
		} catch (raised) {
			const failure = apiRequestError(raised);
			setError(failure.detail ?? failure.message);
		} finally {
			setBusy(false);
		}
	};

	return {
		setup,
		content,
		loading,
		busy,
		error,
		fenced,
		conflict,
		unavailable,
		missing,
		dirty,
		acceptedContentEpoch,
		accept,
		change,
		flush,
		setError,
		resolveConflict,
		acknowledged: () => saved.current
	};
}
