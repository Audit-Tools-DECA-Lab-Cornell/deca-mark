import { roundLabel } from "../../domain/rounds";
import { stateOf } from "../../ui/tokens";
import type { QueueRecord } from "../preview/fixtures";
import type { Queue } from "../preview/queue";

/**
 * The words of the Observations list (MOB-38), kept apart from the screen so the tests hold them to
 * PRODUCT.md: the queue words come from the contract and are never rephrased; "Uploaded" is only what
 * the queue says it is (a receipt); practice is a record that never uploads.
 */

/** The chip that clears the zone filter. */
export const ALL_ZONES = "All zones";

/** The zones the records are in, once each, in reading order. */
export function zonesOf(records: readonly QueueRecord[]): string[] {
  return [...new Set(records.map((record) => record.zone))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

/** The records in one zone, or all of them when no zone is chosen. */
export function inZone(records: readonly QueueRecord[], zone: string | null): QueueRecord[] {
  return zone === null ? [...records] : records.filter((record) => record.zone === zone);
}

/** "North meadow · Standard round · Oct 02 · 11:32": where and when, as the row's second line. */
export function placeLine(record: QueueRecord): string {
  return [record.zone, roundLabel(record.roundType), record.captured ?? record.time].join(" · ");
}

/** The same words for a screen reader, which reads the commas as pauses. */
function placeSpoken(record: QueueRecord): string {
  return [record.zone, roundLabel(record.roundType), record.captured ?? record.time].join(", ");
}

const LEAD_WORDS = /^Needs attention\.\s*/;

/**
 * What the device keeps about why a record has not uploaded: the server's reason for a record that
 * needs attention, or what the last try said for one that is still waiting. The state is drawn as a
 * badge beside it, so a reason that begins "Needs attention." does not say it twice.
 */
export function reasonOf(record: QueueRecord): string | null {
  const problem = record.problem?.trim();
  if (!problem) return null;
  const rest = record.state === "attention" ? problem.replace(LEAD_WORDS, "") : problem;
  return rest.length > 0 ? rest : null;
}

/** The practice line, for a record that has no project binding and so never uploads. */
export function practiceOf(record: QueueRecord): string | null {
  return record.practice === true ? (record.storage ?? null) : null;
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * The one thing a screen reader says for a record: its number, where and when, its state, why it has
 * not uploaded and, for practice, that it never will. The row's parts are hidden from the reader, so
 * this is the whole row.
 */
export function rowLabel(record: QueueRecord): string {
  const parts = [
    sentence(record.label),
    sentence(placeSpoken(record)),
    sentence(stateOf("queue", record.state).label),
  ];
  const reason = reasonOf(record);
  if (reason) parts.push(sentence(reason));
  const practice = practiceOf(record);
  if (practice) parts.push(sentence(practice));
  return parts.join(" ");
}

/** "1 not uploaded · 5 uploaded": the bound records only, so practice is never counted as waiting. */
export function summaryLine(queue: Pick<Queue, "unsent" | "counts">): string | null {
  const { unsent, counts } = queue;
  if (unsent + counts.uploaded === 0) return null;
  return `${unsent} not uploaded · ${counts.uploaded} uploaded`;
}

/**
 * The note above the list when the server turned records away: what happened, where they are, and what
 * retrying really does (it sends the same record again; it changes nothing).
 */
export function attentionNote(count: number): { title: string; body: string } {
  return count === 1
    ? {
        title: "1 observation needs attention.",
        body: "DECA Mark did not accept it. It stays on this device exactly as you saved it. Retrying sends the same record again and does not change it. It can be accepted only once the reason on its row is fixed.",
      }
    : {
        title: `${count} observations need attention.`,
        body: "DECA Mark did not accept them. They stay on this device exactly as you saved them. Retrying sends the same records again and does not change them. Each can be accepted only once the reason on its row is fixed.",
      };
}

/** What a screen reader hears when the zone filter changes. */
export function filterAnnouncement(zone: string | null, shown: number, total: number): string {
  return `${zone ?? ALL_ZONES}: ${shown} of ${total} observations shown.`;
}
