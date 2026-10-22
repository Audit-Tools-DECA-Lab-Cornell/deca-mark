import { createForegroundDrain } from "/home/user/deca-mark/mobile/src/sync/foreground.ts";
let drains=0, changed=0;
const q=createForegroundDrain({drain: async()=>{drains++}, changed:()=>{changed++}, failed:()=>{}, current:()=>true});
q.connectivity(true); q.foreground(true);
await new Promise(r=>setTimeout(r,10));
// emulate provider.tsx:127 setInterval(5000) wake with 0 rows pending: 6 ticks
for(let i=0;i<6;i++){ await q.wake(); }
console.log({drains, changed}, "(7 wakes with an empty queue; changed() -> setRevision -> useObservations refresh -> setLoading(true))");
