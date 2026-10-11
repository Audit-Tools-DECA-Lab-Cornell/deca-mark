#!/usr/bin/env node
/** FieldMaps mobile capture: no credentials, app resets, mocks, or hosted API calls. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

const CAPTURES = {
  public: [
    { name: "01-welcome", route: "/welcome", label: "Welcome" },
    { name: "02-sign-in", route: "/sign-in", label: "Sign in" },
    {
      name: "03-create-account",
      route: "/create-account",
      label: "Create account",
    },
    {
      name: "04-forgot-password",
      route: "/forgot-password",
      label: "Password recovery",
    },
  ],
  protected: [
    { name: "01-projects", route: "/", label: "Projects home" },
    {
      name: "02-observations",
      route: "/observations",
      label: "Observations / records",
    },
    { name: "03-account", route: "/account", label: "Account and settings" },
    {
      name: "04-field-guide",
      route: "/account/field-guide",
      label: "Offline field guide",
    },
    { name: "05-join-project", route: "/join-project", label: "Join project" },
  ],
  manual: [
    {
      name: "01-site-map",
      route: null,
      label: "Open a ready site and its map",
    },
    {
      name: "02-before-begin",
      route: null,
      label: "Open before-you-begin session setup",
    },
    {
      name: "03-place-point",
      route: null,
      label: "Open collection: Place step",
    },
    { name: "04-question", route: null, label: "Open collection: Answer step" },
    { name: "05-review", route: null, label: "Open collection: Review step" },
    { name: "06-saved", route: null, label: "Open collection: Saved step" },
  ],
};

function argsParse(args) {
  const options = {
    platform: "ios",
    device: null,
    mode: "protected",
    theme: "day",
    targets: null,
    yes: false,
    list: false,
    dryRun: false,
    settle: 3500,
    output: null,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      help();
      process.exit(0);
    }
    if (arg === "--yes") {
      options.yes = true;
      continue;
    }
    if (arg === "--list") {
      options.list = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    const val = args[++i];
    if (!val || val.startsWith("--"))
      throw new Error(`Missing value for ${arg}`);
    if (arg === "--platform") options.platform = val;
    else if (arg === "--device") options.device = val;
    else if (arg === "--mode") options.mode = val;
    else if (arg === "--theme") options.theme = val;
    else if (arg === "--only")
      options.targets = val.split(",").map((x) => x.trim());
    else if (arg === "--settle-ms") options.settle = Number(val);
    else if (arg === "--output") options.output = val;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!["ios", "android"].includes(options.platform))
    throw new Error("--platform must be ios or android");
  if (!Object.hasOwn(CAPTURES, options.mode))
    throw new Error("--mode must be public, protected, or manual");
  if (!["day", "dusk"].includes(options.theme))
    throw new Error("--theme must be day or dusk");
  if (
    !Number.isSafeInteger(options.settle) ||
    options.settle < 0 ||
    options.settle > 60000
  )
    throw new Error("--settle-ms must be 0..60000");
  return options;
}
function help() {
  process.stdout.write(
    `FieldMaps native screenshot capture\n\nUsage:\n  node scripts/screenshots-mobile.mjs --list\n  node scripts/screenshots-mobile.mjs --platform ios --mode protected --theme day\n  node scripts/screenshots-mobile.mjs --platform android --mode manual --theme dusk\n  node scripts/screenshots-mobile.mjs --platform ios --device <UDID> --mode public\n\nOptions:\n  --platform ios|android\n  --device <simulator UDID / Android serial> (auto if exactly one connected)\n  --mode public|protected|manual\n  --theme day|dusk   Metadata ONLY: set the APP'S screen preference beforehand\n  --only a,b,c       Comma-separated target IDs from --list\n  --output PATH      Override output directory\n  --settle-ms N      Automatic wait after opening a deep link (default 3500)\n  --yes              Noninteractive; screenshot identity remains unverified\n  --dry-run          Show plan without requiring a device\n\nNever logs in, deletes data, resets storage, or changes the product theme.\n`,
  );
}
function run(command, args, opts = {}) {
  const x = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 45000,
    maxBuffer: 24 * 1024 * 1024,
    ...opts,
  });
  if (x.error || x.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed: ${x.error?.message ?? String(x.stderr).slice(0, 350)}`,
    );
  return x.stdout;
}
function detect(options) {
  if (options.platform === "ios") {
    const output = JSON.parse(
      run("xcrun", ["simctl", "list", "devices", "--json"]),
    );
    const devices = Object.values(output.devices)
      .flat()
      .filter((x) => x.state === "Booted" && /iPhone|iPad/.test(x.name));
    const found = options.device
      ? devices.filter(
          (x) => x.udid === options.device || x.name === options.device,
        )
      : devices;
    if (found.length !== 1)
      throw new Error(
        `Expected one booted iOS simulator, found ${found.length}. Pass --device <UDID>.`,
      );
    const d = found[0];
    return {
      id: d.udid,
      label: d.name,
      family: /ipad/i.test(d.name) ? "ipad" : "iphone",
    };
  }
  const output = run("adb", ["devices", "-l"]);
  const devices = output
    .split(/\r?\n/)
    .slice(1)
    .map((x) => x.trim())
    .filter((x) => /\sdevice(?:\s|$)/.test(x));
  const found = options.device
    ? devices.filter((x) => x.split(/\s+/)[0] === options.device)
    : devices;
  if (found.length !== 1)
    throw new Error(
      `Expected one connected Android device, found ${found.length}. Pass --device <serial>.`,
    );
  const serial = found[0].split(/\s+/)[0];
  const size = run("adb", ["-s", serial, "shell", "wm", "size"]);
  const density = run("adb", ["-s", serial, "shell", "wm", "density"]);
  const dimensions = /(?:Physical|Override) size:\s*(\d+)x(\d+)/.exec(size);
  const dpi = /(?:Physical|Override) density:\s*(\d+)/.exec(density);
  const tablet =
    dimensions && dpi
      ? (Math.min(Number(dimensions[1]), Number(dimensions[2])) * 160) /
          Number(dpi[1]) >=
        600
      : /tablet|tab|sm-x/i.test(found[0]);
  return { id: serial, label: serial, family: tablet ? "tablet" : "phone" };
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function openRoute(options, device, route) {
  if (route === null) return;
  // Expo Router removes layout-group parentheses from external paths.
  const deepLink = `fieldmaps:///${route.replace(/^\/+/, "")}`;
  if (options.platform === "ios")
    run("xcrun", ["simctl", "openurl", device.id, deepLink]);
  else
    run("adb", [
      "-s",
      device.id,
      "shell",
      "am",
      "start",
      "-W",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      deepLink,
    ]);
}
async function capture(options, device, file) {
  if (options.platform === "ios") {
    run("xcrun", ["simctl", "io", device.id, "screenshot", file]);
    return readFile(file);
  }
  const png = run("adb", ["-s", device.id, "exec-out", "screencap", "-p"], {
    encoding: null,
  });
  await writeFile(file, png);
  return png;
}
function dimensions(png) {
  return png.subarray(1, 4).toString() === "PNG"
    ? { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
    : null;
}
async function main() {
  const options = argsParse(process.argv.slice(2));
  const targets = CAPTURES[options.mode].filter(
    (x) => options.targets === null || options.targets.includes(x.name),
  );
  if (!targets.length)
    throw new Error("No matching targets. Use --list to see target IDs.");
  if (options.list) {
    for (const [mode, items] of Object.entries(CAPTURES)) {
      console.log(`\n${mode}:`);
      items.forEach((x) =>
        console.log(
          `  ${x.name}: ${x.route ?? "(prepare UI manually)"} - ${x.label}`,
        ),
      );
    }
    return;
  }
  if (options.dryRun) {
    console.log(JSON.stringify({ options, targets }, null, 2));
    return;
  }
  const device = detect(options);
  const output = path.resolve(
    options.output ??
      `assets/screenshots/mobile/raw/${options.platform}/${device.family}/${options.theme}`,
  );
  await mkdir(output, { recursive: true });
  console.log(
    `Using ${device.label}. Screen theme '${options.theme}' is a LABEL, not an automatic setting.`,
  );
  console.log(
    "Prepare the account and the in-app Day/Dusk preference before capturing.",
  );
  let rl;
  if (!options.yes)
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    platform: options.platform,
    device: device.label,
    deviceId: device.id,
    family: device.family,
    theme: options.theme,
    captureMode: options.mode,
    screenStateVerified: false,
    captures: [],
    failures: [],
  };
  let priorHash = null;
  try {
    for (const target of targets) {
      try {
        openRoute(options, device, target.route);
        if (options.yes) await pause(options.settle);
        else
          await rl.question(
            `${target.name}: ${target.label}. Check the intended screen and press Enter to capture... `,
          );
        const file = path.join(output, `${target.name}.png`);
        const png = await capture(options, device, file);
        const hash = createHash("sha256").update(png).digest("hex");
        if (hash === priorHash)
          console.warn(
            `Warning: ${target.name} is pixel-identical to the preceding target; check for a redirect or frozen UI.`,
          );
        priorHash = hash;
        manifest.captures.push({
          id: target.name,
          label: target.label,
          route: target.route,
          file: path.relative(process.cwd(), file),
          sha256: hash,
          dimensions: dimensions(png),
          verifiedByOperator: !options.yes,
        });
        console.log(`Saved ${file}`);
      } catch (e) {
        console.error(`Failed ${target.name}: ${e.message}`);
        manifest.failures.push({ id: target.name, error: e.message });
      }
    }
  } finally {
    await rl?.close();
  }
  manifest.screenStateVerified = !options.yes && manifest.failures.length === 0;
  await writeFile(
    path.join(output, `manifest-${options.mode}.json`),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  if (manifest.failures.length) process.exitCode = 1;
  console.log(
    `${manifest.captures.length} captured; ${manifest.failures.length} failed.`,
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
