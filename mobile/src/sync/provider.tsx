import { createContext, type PropsWithChildren, useCallback, useContext, useState } from "react";

const SyncContext = createContext({
  revision: 0,
  error: "",
  wake: () => {},
  retry: async () => {},
});

/** MOB-29 connects the single bound uploader. Until then every record stays on this device. */
export function SyncProvider({ children }: PropsWithChildren) {
  const [revision, setRevision] = useState(0);
  const wake = useCallback(() => setRevision((value) => value + 1), []);
  const retry = useCallback(async () => wake(), [wake]);
  return <SyncContext value={{ revision, error: "", wake, retry }}>{children}</SyncContext>;
}

export function useSync() {
  return useContext(SyncContext);
}
