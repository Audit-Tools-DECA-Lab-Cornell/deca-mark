/** Wait for all edits present at navigation time, including changes during an earlier save. */
export async function drainSaves(save: () => Promise<boolean>, current: () => boolean): Promise<boolean> {
	while (!current()) {
		if (!(await save())) return false;
	}
	return true;
}
