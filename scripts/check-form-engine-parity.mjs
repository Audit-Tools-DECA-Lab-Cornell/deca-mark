#!/usr/bin/env node
// Checks that web/src/lib/forms/{definition,engine,temporal}.ts stay byte-identical to their mobile
// originals below a short header comment. Plain Node ESM, no dependencies.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const files = ["definition.ts", "engine.ts", "temporal.ts"];

/** Normalizes CRLF/CR to LF so the comparison ignores line-ending differences. */
function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Strips leading lines that start with `//` (the copy's header comment) from web's copy. */
function stripLeadingLineComments(text) {
  const lines = normalizeLineEndings(text).split("\n");
  let index = 0;
  while (index < lines.length && lines[index].trimStart().startsWith("//")) index++;
  return lines.slice(index).join("\n");
}

let failed = false;

for (const file of files) {
  const mobilePath = join(repoRoot, "mobile", "src", "forms", file);
  const webPath = join(repoRoot, "web", "src", "lib", "forms", file);

  let mobileContent;
  let webContent;
  try {
    mobileContent = readFileSync(mobilePath, "utf8");
  } catch (error) {
    console.error(`forms:parity: could not read mobile source "${mobilePath}": ${error.message}`);
    failed = true;
    continue;
  }
  try {
    webContent = readFileSync(webPath, "utf8");
  } catch (error) {
    console.error(`forms:parity: could not read web copy "${webPath}": ${error.message}`);
    failed = true;
    continue;
  }

  const mobileNormalized = normalizeLineEndings(mobileContent);
  const webStripped = stripLeadingLineComments(webContent);

  if (webStripped !== mobileNormalized) {
    console.error(
      `forms:parity: web/src/lib/forms/${file} has drifted from mobile/src/forms/${file}. ` +
        `Keep the web copy identical below its header comment, or re-copy it from mobile.`,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log("forms:parity: web/src/lib/forms matches mobile/src/forms.");
}
