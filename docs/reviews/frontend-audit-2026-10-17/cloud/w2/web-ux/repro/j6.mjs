import { load } from "/home/user/deca-mark/web/tests/unit/support.mjs";
const q = await load("features/zones/editor/save-queue.ts");
const square = (s) => ({ type: "Polygon", coordinates: [[[0,0],[s,0],[s,s],[0,s],[0,0]]] });
const z = (s) => [{ zone_id: "11111111-1111-4111-8111-111111111111", zone_code: "A", zone_label: "A", geometry: square(s) }];
const time = (iso) => iso;
const base = { zones: z(0.01), changeNote: "", revision: 5, etag: '"5"', state: "draft", updatedAt: "2026-10-21T10:00:00Z", updatedBy: null, publishedPackageId: null };
let queue = q.createQueue(base);
const log = [];
function apply(ev) { const s = q.queueReducer(queue, ev); queue = s.queue; if (s.command) log.push(s.command.type + "#" + s.command.seq); return s.command; }
apply({ type: "edited", local: { zones: z(0.02), changeNote: "" }, invalid: null });
let cmd = apply({ type: "flush" });
console.log("1. first command:", cmd.type);
// Case A: API down (connection refused): PUT fails (network), then the verify GET fails too.
cmd = apply({ type: "put-failed", seq: cmd.seq, failure: { kind: "network" } });
console.log("A. after put-failed ->", cmd.type, "status:", q.saveStatus(queue, time).text);
cmd = apply({ type: "get-failed", seq: cmd.seq, failure: { kind: "network" } });
console.log("A. after get-failed -> command:", cmd, "reading:", queue.reading, "inFlight:", !!queue.inFlight, "pause:", queue.pause.kind, "status:", JSON.stringify(q.saveStatus(queue, time)));
// no timer: only flush/online/edit restart it. Nothing is running while the line says "Checking".

// Case B: only the PUT fails (fast), the GET works: loop.
queue = q.createQueue(base); log.length = 0;
apply({ type: "edited", local: { zones: z(0.02), changeNote: "" }, invalid: null });
cmd = apply({ type: "flush" });
let rounds = 0;
for (; rounds < 1000; rounds++) {
  if (cmd.type !== "put") break;
  cmd = apply({ type: "put-failed", seq: cmd.seq, failure: { kind: "network" } });
  if (!cmd || cmd.type !== "get") break;
  cmd = apply({ type: "get-ok", seq: cmd.seq, draft: { ...base } });
  if (!cmd) break;
}
console.log("B. PUT fails (network) & GET ok at same revision: PUT/GET pairs issued with no delay or limit:", rounds, "(stopped by my 1000 cap); last cmds:", log.slice(-4).join(","));
// status text at the moment between: 
