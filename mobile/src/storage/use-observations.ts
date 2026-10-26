import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useRef, useState } from "react";
import { useAccount } from "../auth/provider";
import type { Observation } from "../domain/observation";
import { useSync } from "../sync/provider";
import { listObservations } from "./observation-store";

export function useObservations() {
  const database = useSQLiteContext();
  const { key, ready } = useAccount();
  const { revision } = useSync();
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [records, setRecords] = useState<readonly Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  // The account whose records were last read. Only its first read is "loading"; after that a read
  // keeps showing the records it has, so a re-read with nothing new never flashes a loading state.
  const readFor = useRef<string | null>(null);
  const refresh = useCallback(() => {
    const current = ++generation.current;
    if (readFor.current !== key) setLoading(true);
    setError(null);
    if (!ready) return;
    listObservations(database, key).then(
      (result) => {
        if (current === generation.current) {
          readFor.current = key;
          setRecords(result);
          setLoadedKey(key);
          setLoading(false);
        }
      },
      (cause: unknown) => {
        if (current === generation.current) {
          setError(cause instanceof Error ? cause.message : "Could not read observations.");
          setLoading(false);
        }
      },
    );
  }, [database, key, ready]);
  useFocusEffect(
    useCallback(() => {
      void revision;
      refresh();
      return () => {
        generation.current += 1;
      };
    }, [refresh, revision]),
  );
  return {
    records: loadedKey === key && ready ? records : [],
    loading: loading || !ready,
    error,
    retry: refresh,
  };
}
