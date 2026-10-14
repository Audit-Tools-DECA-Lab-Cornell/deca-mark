# MOB-30 to MOB-32 handoff to the mobile data agent

2026-10-14, from the Claude mobile UI owner. MOB-30, MOB-31 and MOB-32 are done on component tests and the mobile checks ([plan](PLAN.md)); MOB-29 no longer waits on them. The screens read only the MOB-33 interface (`src/packages/zone-read-models.ts`), and collect builds its placement candidates on your `zoneCovers`, as the user asked, so the save gate and collect cannot disagree.

Four requests follow. Each is in a file only you change.

## 1. Make `zoneCovers` exact on edges (`src/maps/zone-boundaries.ts`)

[UI plan](ZONE-BOUNDARIES-UI.md) MUI-3 and the contract's "Point attribution" ask for an exact on-segment test: orientation equal to zero, with no epsilon. `zoneCovers` passes all 16 `coverage_cases`, but it decides "on the edge" by comparing two floating-point products with `===`, and it ray-casts with a floating-point division. Rounding then decides points within a few units in the last place of a sloping edge:

- a point exactly on a sloping line can be missed;
- a point one double off it can be counted as on it;
- a point near a shared diagonal edge can land in the wrong one of two zones.

The server decides with PostGIS, whose orientation is robust, so the device and the server can attribute such a point differently. That matters most for MOB-29's save gate.

Three checks fail today against an exact oracle. In the oracle, each double is an exact fraction over 2^1100 and the sign comes from the BigInt cross product:

```ts
// Two triangles sharing the diagonal a–b near Fall Creek.
const a = [-76.48613, 42.44801], b = [-76.48407, 42.44897];
const below = zone([[a, [b[0], a[1]], b, a]]), above = zone([[a, b, [a[0], b[1]], a]]);
// For 399 points along a–b and the next double above or to the right of each, the zones covering the point
// should follow the exact side of a→b: left → ["above"], right → ["below"], on → both.
// Fails: expected ["above"], got ["below"].

// Kettner et al.'s grid: 64 × 64 points 2^-53 apart from (0.5, 0.5), against the edge (-11.5, -11.5)–(24, 24).
// Fails: expected ["left"], got ["left", "right"].

// y = x: [0.0037, nextUp(0.0037)] is strictly above the diagonal.
// Fails: expected ["upper"], got ["lower", "upper"].
```

The proposed fix uses a floating-point orientation where it is certain (Shewchuk's orient2d error bound), and exact BigInt arithmetic where it is not. A point exactly on a ring's segment covers; otherwise the winding number decides. The UI owner built and tested this before MOB-33 landed. It passes all 16 `coverage_cases` and the three checks above:

```ts
const EPSILON = 2 ** -53;
const ORIENTATION_BOUND = (3 + 16 * EPSILON) * EPSILON;

/** A finite double as an integer times a power of two, exactly. */
function exactParts(value: number): { mantissa: bigint; exponent: number } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const high = view.getUint32(0);
  const sign = high >>> 31 === 1 ? -1n : 1n;
  const biased = (high >>> 20) & 0x7ff;
  const fraction = (BigInt(high & 0xfffff) << 32n) | BigInt(view.getUint32(4));
  if (biased === 0) return { mantissa: sign * fraction, exponent: -1074 };
  return { mantissa: sign * (fraction | (1n << 52n)), exponent: biased - 1075 };
}

function exactOrientation(a: Coordinate, b: Coordinate, p: Coordinate): number {
  const parts = [a[0], a[1], b[0], b[1], p[0], p[1]].map(exactParts);
  let least = 0;
  for (const part of parts) if (part.mantissa !== 0n) least = Math.min(least, part.exponent);
  const [ax, ay, bx, by, px, py] = parts.map((part) => part.mantissa << BigInt(part.exponent - least));
  const det = (ax - px) * (by - py) - (ay - py) * (bx - px);
  return det > 0n ? 1 : det < 0n ? -1 : 0;
}

/** 1 left of a→b, -1 right, 0 exactly on the line. */
function orientation(a: Coordinate, b: Coordinate, p: Coordinate): number {
  const left = (a[0] - p[0]) * (b[1] - p[1]);
  const right = (a[1] - p[1]) * (b[0] - p[0]);
  const det = left - right;
  const bound = ORIENTATION_BOUND * (Math.abs(left) + Math.abs(right));
  if (det > bound) return 1;
  if (-det > bound) return -1;
  return exactOrientation(a, b, p);
}

function onSegment(p: Coordinate, a: Coordinate, b: Coordinate): boolean {
  if (p[0] < Math.min(a[0], b[0]) || p[0] > Math.max(a[0], b[0])) return false;
  if (p[1] < Math.min(a[1], b[1]) || p[1] > Math.max(a[1], b[1])) return false;
  return orientation(a, b, p) === 0;
}

/** On the boundary, or inside or outside by winding number. */
function ringPlace(p: Coordinate, ring: Ring): "boundary" | "inside" | "outside" {
  let winding = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (!a || !b) continue;
    if (onSegment(p, a, b)) return "boundary";
    if (a[1] <= p[1]) {
      if (b[1] > p[1] && orientation(a, b, p) > 0) winding += 1;
    } else if (b[1] <= p[1] && orientation(a, b, p) < 0) winding -= 1;
  }
  return winding === 0 ? "outside" : "inside";
}
```

`zoneCovers` then becomes: a part covers when its outer ring's place is `boundary`; or when it is `inside` and no hole holds the point strictly inside (a hole's boundary still covers). `coveringZones` in `src/maps/geometry.ts` needs no change. Please add the three checks to your suite with the change, and do the parity review that MOB-31's Owner line asks of you on `zoneCovers` itself.

## 2. Give `Recovered` its form version (`src/packages/zone-model-types.ts`)

MUI-7's form-missing card should read "Form janet-test-v1 for this observation is not on this device." `Recovered` carries no form version, so the card says "The form for this observation is not in map v1 on this device." (amended as built in the UI plan). With a `formVersion` on `Recovered`, the UI will name the form.

## 3. Readiness from the verified catalog in `isStored` (`src/packages/hosted/context.ts`)

`isStored(site)` checks only the site list's current package (`site.package.package_id`). With map v1 verified on this device and v2 published, it reports false. `hostedDownload` and the preview data source then call the site "Not downloaded", which MUI-1 rules out. The Projects, Project and Site screens already read `siteVersionSnapshot` for hosted sites on device data. Other uses of `site.download` still follow `isStored`, for example the "Downloads on this device" line under a project. Basing it on any verified installed version (`nextSessionPackageId`) would make every screen agree.

## 4. Update `MOB-33-HANDOFF.md`

It still says the UI owner's acknowledgment is pending. The acknowledgment is recorded under MOB-33 in [PLAN.md](PLAN.md) (2026-10-14).
