import { load } from "/home/user/deca-mark/web/tests/unit/support.mjs";
const { searchLoaded } = await load("features/data/view.ts");
const recs = [
  { id: "a", search: "obs-700000 11111111-aaaa jl site one zone a standard synthetic record 1" },
  { id: "b", search: "obs-700000 22222222-bbbb ak site two zone b reliability synthetic record 2" },
  { id: "c", search: "obs-700000 77777777-cccc ak site two zone b reliability synthetic record 7" },
];
const ids = q => searchLoaded(recs, q).map(r => r.id).join(",");
console.log("'synthetic record 7' ->", ids("synthetic record 7"), "(AND of substrings: only c; any-word would give a,b,c)");
console.log("'record 7' ->", ids("record 7"));
console.log("'synthetic nope' ->", ids("synthetic nope"), "(any-word semantics would return all)");
// seed artifact: every row shares the label prefix 'obs-700000' so a term '7' or '70' is a substring of all rows
console.log("'record 7' with all rows containing '7' in label (seed: OBS-700000):", ids("record 7"));
console.log("'7' ->", ids("7"));
