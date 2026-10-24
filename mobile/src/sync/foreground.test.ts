import { describe, expect, it } from "vitest";
import { createForegroundDrain } from "./foreground";

function setup(drain: () => Promise<boolean>) {
  const calls = { drains: 0, changed: 0, failed: [] as string[] };
  const queue = createForegroundDrain({
    drain: async () => {
      calls.drains++;
      return drain();
    },
    changed: () => {
      calls.changed++;
    },
    failed: (error) => calls.failed.push(error.message),
    current: () => true,
  });
  return { queue, calls };
}

describe("Foreground drain (MOB-39)", () => {
  it("an empty drain tells no screen that anything changed", async () => {
    const { queue, calls } = setup(async () => false);
    queue.connectivity(true);
    queue.foreground(true);
    for (let tick = 0; tick < 6; tick++) await queue.wake();
    expect(calls.drains).toBeGreaterThanOrEqual(6);
    expect(calls.changed).toBe(0);
  });

  it("a drain that changed a record tells the screens once per pass", async () => {
    const { queue, calls } = setup(async () => true);
    queue.connectivity(true);
    queue.foreground(true);
    await queue.wake();
    expect(calls.changed).toBe(calls.drains);
    expect(calls.changed).toBeGreaterThan(0);
  });

  it("a wake that arrives during a send gets one follow-up pass", async () => {
    let release: () => void = () => {};
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pass = 0;
    const { queue, calls } = setup(async () => {
      if (++pass === 1) await first;
      return false;
    });
    queue.connectivity(true);
    queue.foreground(true);
    const running = queue.wake();
    void queue.wake();
    void queue.wake();
    release();
    await running;
    expect(calls.drains).toBe(2);
  });

  it("reports a failed drain and stays usable", async () => {
    let pass = 0;
    const { queue, calls } = setup(async () => {
      if (++pass === 1) throw new Error("database is locked");
      return true;
    });
    queue.connectivity(true);
    queue.foreground(true);
    await queue.wake();
    expect(calls.failed).toEqual(["database is locked"]);
    await queue.wake();
    expect(calls.changed).toBe(1);
  });
});
