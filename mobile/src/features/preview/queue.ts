import { useMemo } from "react";
import { isShellObservation, type Observation } from "../../domain/observation";
import { shortLabel } from "../../session/provider";
import { useObservations } from "../../storage/use-observations";
import { useSync } from "../../sync/provider";
import type { DataMode } from "./data-mode";
import { PREVIEW_QUEUE, type QueueRecord, type QueueState } from "./fixtures";

const STATUS_TO_STATE: Record<Observation["storageStatus"], QueueState> = {
  "local-only": "held",
  pending: "onDevice",
  synced: "uploaded",
  "needs-attention": "attention",
};

function fromDevice(record: Observation): QueueRecord {
  const created = new Date(record.createdAt);
  const time = `${String(created.getHours()).padStart(2, "0")}:${String(created.getMinutes()).padStart(2, "0")}`;
  const practice = isShellObservation(record);
  const zone = practice ? "Practice garden" : record.context.zoneLabel;
  const roundType = practice ? "standard" : record.context.roundType;
  return {
    id: record.id,
    label: shortLabel(record.id),
    zone,
    roundType,
    time,
    state: STATUS_TO_STATE[record.storageStatus],
    summary: practice
      ? "Practice record"
      : roundType === "inventory"
        ? "Zone inventory"
        : "Behaviour mapping",
    problem: record.syncError || undefined,
    storage: record.storageStatus === "synced" ? "Uploaded" : "On this device",
    observer: record.observer,
    form: record.formVersion,
  };
}

export type QueueCounts = Record<QueueState, number>;

export type Queue = {
  records: QueueRecord[];
  counts: QueueCounts;
  /** Records that have not been acknowledged by the server. */
  unsent: number;
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
  const counts = countStates(records);
  return {
    records,
    counts,
    unsent: records.length - counts.uploaded,
    loading: mode === "preview" ? false : device.loading,
    error: mode === "preview" ? null : device.error,
    retry: device.retry,
    uploadNow: sync.wake,
  };
}
