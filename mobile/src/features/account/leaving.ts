/**
 * The words for leaving (MOB-07, PRODUCT.md "Voice and copy"): what waits on this device before a
 * sign-out or an account deletion, said before either happens. Pure, so the tests hold them to the copy.
 */

/** What this account still has on this device that the server has not acknowledged. */
export type LocalWork = {
  /** Records not acknowledged by the server: on device, uploading, needs attention and held. */
  readonly unsent: number;
  /** Of those, held for the project (they wait on the project, not on the observer). */
  readonly held: number;
  /** Of those, refused by the server with something to fix. */
  readonly attention: number;
  /** Unfinished observations: the open one and the ones kept for later. */
  readonly drafts: number;
};

export function nothingWaits(work: LocalWork): boolean {
  return work.unsent === 0 && work.drafts === 0;
}

function observations(count: number): string {
  return count === 1 ? "1 observation has" : `${count} observations have`;
}

/**
 * Sign out? (PRODUCT.md): "Your unsent work needs a clear owner. 5 observations have not been
 * uploaded. They remain on this device for ps2245@cornell.edu. Another account cannot upload them."
 * Null when nothing waits.
 */
export function signOutWarning(work: LocalWork, email: string): readonly string[] | null {
  if (nothingWaits(work)) return null;
  const lines = ["Your unsent work needs a clear owner."];
  if (work.unsent > 0) lines.push(`${observations(work.unsent)} not been uploaded.`);
  if (work.held > 0)
    lines.push(
      work.held === 1
        ? "1 of them is held for the project."
        : `${work.held} of them are held for the project.`,
    );
  if (work.drafts > 0)
    lines.push(
      work.drafts === 1
        ? "1 unfinished observation is kept."
        : `${work.drafts} unfinished observations are kept.`,
    );
  lines.push(`They remain on this device for ${email}. Another account cannot upload them.`);
  return lines;
}

/**
 * What deleting the account does, before it is confirmed. The records on this device are not removed
 * by this build: they stay, and can never upload, as for any account the server deleted.
 */
export function deletionConsequences(
  work: LocalWork,
  projects: number,
  observerCode: string | null,
): readonly string[] {
  const memberships =
    projects === 1 ? "your membership in 1 project" : `your memberships in ${projects} projects`;
  const lines = [
    `Your profile and ${memberships} are removed.`,
    observerCode
      ? `Observations already uploaded stay with their projects as research data, under observer code ${observerCode}.`
      : "Observations already uploaded stay with their projects as research data.",
  ];
  if (work.unsent > 0)
    lines.push(
      `${observations(work.unsent)} not been uploaded. ${work.unsent === 1 ? "It stays" : "They stay"} on this device and can never upload.`,
    );
  if (work.drafts > 0)
    lines.push(
      work.drafts === 1
        ? "Your unfinished observation stays on this device and can never be saved for upload."
        : `Your ${work.drafts} unfinished observations stay on this device and can never be saved for upload.`,
    );
  lines.push("This device signs out of the account.");
  return lines;
}

/** "Upload 5 records first", the way out of deleting with unsent records. */
export function uploadFirstLabel(unsent: number): string {
  return unsent === 1 ? "Upload 1 record first" : `Upload ${unsent} records first`;
}
