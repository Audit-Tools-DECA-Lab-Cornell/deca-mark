import { useMemo } from "react";
import { isBoundObservation, isShellObservation, type Observation } from "../../domain/observation";
import { shortLabel } from "../../session/provider";
import { useObservations } from "../../storage/use-observations";
import { useSync } from "../../sync/provider";
import type { DataMode } from "./data-mode";
import { PREVIEW_QUEUE, type QueueRecord, type QueueState } from "./fixtures";

/**
 * `local-only` is stored here and never sent (a practice record, or a record kept without an account).
 * It is not "held": that word is the contract's for a record waiting on the project (PRODUCT.md).
 */
const STATUS_TO_STATE: Record<Observation["storageStatus"], QueueState> = {
  "local-only": "onDevice",
  pending: "onDevice",
  synced: "uploaded",
  "needs-attention": "attention",
};

function fromDevice(record: Observation): QueueRecord {
  const created = new Date(record.createdAt);
  const time = `${String(created.getHours()).padStart(2, "0")}:${String(created.getMinutes()).padStart(2, "0")}`;
  // Practice is a record with no project binding: it never uploads. The shell form is only one kind of it.
  const practice = !isBoundObservation(record);
  const shell = isShellObservation(record);
  const zone = shell ? "Practice garden" : record.context.zoneLabel;
  const roundType = shell ? "standard" : record.context.roundType;
  return {
    id: record.id,
    label: shortLabel(record.id),
    zone,
    roundType,
    time,
    state: STATUS_TO_STATE[record.storageStatus],
    practice,
    summary: practice
      ? "Practice record"
      : roundType === "inventory"
        ? "Zone inventory"
        : "Behaviour mapping",
    problem: record.syncError || undefined,
    storage: practice
      ? "Practice record: stays on this device and is never uploaded"
      : record.storageStatus === "synced"
        ? "Uploaded"
        : "On this device",
    observer: record.observer,
    form: record.formVersion,
  };
}

export type QueueCounts = Record<QueueState, number>;

export type Queue = {
  records: QueueRecord[];
  counts: QueueCounts;
  /** Records that have not been acknowledged by the server. Practice records are not among them. */
  unsent: number;
  /** Practice records (no project binding): they stay on this device and are never uploaded. */
  practice: number;
  loading: boolean;
  error: string | null;
  retry: () => void;
  uploadNow: () => void;
};

function countStates(records: QueueRecord[]): QueueCounts {
  const counts: QueueCounts = { onDevice: 0, uploading: 0, uploaded: 0, attention: 0, held: 0 };
  for (const record of records) counts[record.state] += 1;
  return counts;
}

/** The upload queue in the five Contour states, newest first. */
export function useQueueForMode(mode: DataMode): Queue {
  const device = useObservations();
  const sync = useSync();
  const records = useMemo(
    () => (mode === "preview" ? PREVIEW_QUEUE : device.records.map(fromDevice)),
    [mode, device.records],
  );
  // The states and "unsent" describe what can still upload; practice rows are counted on their own.
  const bound = records.filter((record) => record.practice !== true);
  const counts = countStates(bound);
  return {
    records,
    counts,
    unsent: bound.length - counts.uploaded,
    practice: records.length - bound.length,
    loading: mode === "preview" ? false : device.loading,
    error: mode === "preview" ? null : device.error,
    retry: device.retry,
    uploadNow: sync.wake,
  };
}
