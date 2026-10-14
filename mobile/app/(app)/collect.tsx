import { useEffect, useRef } from "react";
import { CollectScreen } from "../../src/features/collect/CollectScreen";
import { useFieldSession } from "../../src/session/provider";

/** Collecting: place, answer, review and save, with the map mounted throughout (MOB-26). */
export default function Collect() {
  const session = useFieldSession();
  const actions = useRef(session);
  actions.current = session;
  useEffect(() => {
    actions.current.beginVisit();
    return () => actions.current.endVisit();
  }, []);
  return <CollectScreen />;
}
