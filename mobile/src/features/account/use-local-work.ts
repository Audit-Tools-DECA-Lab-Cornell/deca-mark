import { useFieldSession } from "../../session/provider";
import { useQueue } from "../preview/data-source";
import type { LocalWork } from "./leaving";

/**
 * This account's work on this device (MOB-07): the queue's records in their states, and its unfinished
 * observations (the open or recovered one, and the ones kept for later). `loading` while the queue is
 * still being read, so nothing is said about it yet.
 */
export function useLocalWork(): LocalWork & {
  /** Saved here and not sent yet. */
  readonly onDevice: number;
  /** Acknowledged by DECA Mark, kept here for reference. */
  readonly uploaded: number;
  readonly loading: boolean;
} {
  const queue = useQueue();
  const session = useFieldSession();
  const open = session.recovered !== null || session.inProgress !== null ? 1 : 0;
  return {
    onDevice: queue.counts.onDevice + queue.counts.uploading,
    uploaded: queue.counts.uploaded,
    unsent: queue.unsent,
    held: queue.counts.held,
    attention: queue.counts.attention,
    drafts: open + session.parked.length,
    loading: queue.loading,
  };
}
