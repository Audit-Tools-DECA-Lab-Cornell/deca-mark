import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

test("seed stage opts zones in, keeps the default manifest, and skips each fixture independently", () => {
  const root = mkdtempSync(join(tmpdir(), "e2e-seed-"));
  try {
    mkdirSync(join(root, "bin"));
    mkdirSync(join(root, "database/.local"), { recursive: true });
    writeFileSync(join(root, "bin/node"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$root/calls"\n'
      + 'case "$1" in\n database/seed-web-workspace.mjs) touch "$root/database/.local/web-workspace.json" ;;\n'
      + 'database/seed-zone-review.mjs) touch "$root/database/.local/zone-review.json" ;;\nesac\n', { mode: 0o700 });
    const run = (skip, zones) => execFileSync("sh", ["-eu", "-c",
      '. "$1"; seed_e2e "$root" http://127.0.0.1:8001 "$2" "$3"; printf "%s\\n%s\\n" "$manifest" "${E2E_ZONE_MANIFEST-unset}"',
      "test", resolve("scripts/e2e-local-seed.sh"), String(skip), String(zones)], {
      encoding: "utf8", env: { ...process.env, root, PATH: `${root}/bin:${process.env.PATH}`, E2E_ZONE_MANIFEST: "inherited-hosted" },
    }).trim().split("\n");
    const normal = join(root, "database/.local/web-workspace.json"), zone = join(root, "database/.local/zone-review.json");
    assert.deepEqual(run(0, 0), [normal, "unset"]);
    assert.match(readFileSync(join(root, "calls"), "utf8"), /seed-web-workspace.mjs/);
    assert.doesNotMatch(readFileSync(join(root, "calls"), "utf8"), /seed-zone-review/);
    writeFileSync(join(root, "calls"), "");
    assert.deepEqual(run(1, 1), [normal, zone]);
    assert.doesNotMatch(readFileSync(join(root, "calls"), "utf8"), /seed-web-workspace/);
    assert.match(readFileSync(join(root, "calls"), "utf8"), /seed-zone-review.mjs/);
    writeFileSync(join(root, "calls"), "");
    assert.deepEqual(run(1, 1), [normal, zone]);
    assert.equal(readFileSync(join(root, "calls"), "utf8"), "");
    run(0, 1);
    const calls = readFileSync(join(root, "calls"), "utf8");
    assert.match(calls, /seed-web-workspace.mjs/);
    assert.match(calls, /seed-zone-review.mjs/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
