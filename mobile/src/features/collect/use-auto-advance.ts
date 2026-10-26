import { useCallback, useEffect, useRef } from "react";
import type { SessionAction, SessionDestination, SessionStep } from "../../forms/session";

/** How long a chosen single answer shows before the next question (Contour `base`). */
export const AUTO_ADVANCE_MS = 160;
/**
 * After a question moves on by itself, a choice or toggle is ignored for this long. A second tap of
 * a double tap lands on the next question's tiles, which a finger cannot have read yet (MOB-36).
 */
export const AUTO_ADVANCE_GUARD_MS = 350;

type Dispatch = (action: SessionAction) => SessionStep;

/**
 * The beat between choosing a single answer and the next question, and the guard that keeps a late
 * second tap from answering a question nobody has read.
 *
 * - A tap on the option whose move is pending is ignored: it neither un-chooses nor restarts the beat.
 * - A different option within the beat replaces the first and restarts it.
 * - A choice or toggle in the guard window after the move is ignored.
 * - Any other action (Back, Continue, a write, a jump) cancels a pending move first, as before. A
 *   re-tap of a chosen option long after the move still un-chooses it; that is deliberate.
 *
 * `onDestination` hears every `review` or `map` destination, from an action or from the move itself.
 */
export function useAutoAdvance(
  dispatch: Dispatch,
  onDestination: (destination: Exclude<SessionDestination, "stay">) => void,
) {
  const dispatchRef = useRef(dispatch);
  const destinationRef = useRef(onDestination);
  dispatchRef.current = dispatch;
  destinationRef.current = onDestination;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The choice whose move is waiting on the timer. */
  const pending = useRef<{ question: string; option: string } | null>(null);
  const advancedAt = useRef(Number.NEGATIVE_INFINITY);

  const cancelAdvance = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);
  useEffect(() => cancelAdvance, [cancelAdvance]);

  const dispatchStep = useCallback(
    (action: SessionAction) => {
      if (action.kind === "choose" || action.kind === "toggle") {
        const waiting = pending.current;
        if (
          action.kind === "choose" &&
          waiting !== null &&
          waiting.question === action.question &&
          waiting.option === action.option
        )
          return;
        if (Date.now() - advancedAt.current < AUTO_ADVANCE_GUARD_MS) return;
      }
      const result = dispatchRef.current(action);
      cancelAdvance();
      if (result.autoAdvance && action.kind === "choose") {
        pending.current = { question: action.question, option: action.option };
        timer.current = setTimeout(() => {
          timer.current = null;
          pending.current = null;
          advancedAt.current = Date.now();
          const destination = dispatchRef.current({ kind: "next" }).destination;
          if (destination !== "stay") destinationRef.current(destination);
        }, AUTO_ADVANCE_MS);
      } else if (result.destination !== "stay") destinationRef.current(result.destination);
    },
    [cancelAdvance],
  );

  return { dispatchStep, cancelAdvance };
}
