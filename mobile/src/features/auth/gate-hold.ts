import { useSyncExternalStore } from "react";

/**
 * Keeps the routes where they are while an auth step that signs in is not finished yet. A recovery code
 * (`verifyOtp({type: "recovery"})`) opens a session before the new password is saved; without a hold
 * the gate would close sign-in at once and take the reset screen away before `updateUser` runs. The
 * root layout reads `useGateHeld()` and keeps its last decision while any hold is open.
 *
 * Every hold is released by its own function, at most once, so a screen that unmounts mid-step cannot
 * leave the gate stuck.
 */

const holds = new Set<symbol>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Holds the gate; the returned function releases this hold (again is a no-op). */
export function holdGate(): () => void {
  const hold = Symbol("gate-hold");
  holds.add(hold);
  notify();
  return () => {
    if (holds.delete(hold)) notify();
  };
}

export function isGateHeld(): boolean {
  return holds.size > 0;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useGateHeld(): boolean {
  return useSyncExternalStore(subscribe, isGateHeld, isGateHeld);
}
