/**
 * One foreground drain; wakeups arriving during a send get one follow-up pass. A drain says whether
 * it changed anything a screen shows, and `changed` is called only then.
 */
export function createForegroundDrain(options: {
  readonly drain: () => Promise<boolean>;
  readonly changed: () => void;
  readonly failed: (error: Error) => void;
  readonly current: () => boolean;
}) {
  let running: Promise<void> | null = null;
  let requested = false;
  let online = false;
  let active = false;
  const wake = (): Promise<void> => {
    requested = true;
    if (running) return running;
    if (!online || !active || !options.current()) return Promise.resolve();
    running = (async () => {
      try {
        while (requested && online && active && options.current()) {
          requested = false;
          const updated = await options.drain();
          if (updated && options.current()) options.changed();
        }
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if (options.current()) options.failed(error);
      } finally {
        running = null;
      }
    })();
    return running;
  };
  return {
    wake,
    connectivity(connected: boolean) {
      online = connected;
      if (connected) void wake();
    },
    foreground(foreground: boolean) {
      active = foreground;
      if (foreground) void wake();
    },
  };
}
