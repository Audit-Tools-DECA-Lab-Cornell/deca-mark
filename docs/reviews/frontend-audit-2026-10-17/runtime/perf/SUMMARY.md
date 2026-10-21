# DECA Mark web: runtime performance evidence (LAB)

These are lab measurements from one machine against a local production build. They are not field Core Web Vitals and they are not Lighthouse scores. Every number below comes from a JSON file in this directory (`cold.json`, `recheck-cold.json`, `warm-nav.json`, `api-fanout.json`, `static-bundle.json`, `chunk-modules.json`, `module-inventory.json`, `throttled.json`, `dataset-sizes.json`) or from `throttle-validity.log`. KB means 1024 bytes. "Median (min-max)" is over the samples noted per section.

## 1. Verdict on the throttled run (the open validity question)

**Network and CPU emulation was applied correctly. The throttled TTFB column is an artifact and is invalid; every other throttled metric is valid.**

- `measure.cjs` creates the CDP session with `ctx.newCDPSession(page)` (the page target), enables `Network`, and sends `Network.emulateNetworkConditions` (150 ms latency, 1.6 Mbps down, 750 Kbps up) plus `Emulation.setCPUThrottlingRate` (4x) before `page.goto`. That is the right target and the right order.
- Isolated check: `throttle-validity.log` (script: `throttle-validity.cjs.txt`). It uses a throwaway Node server on 127.0.0.1 (no repo app, no auth) and was run twice with the same results, summarised here:

| Mode | nav responseStart (TTFB) | nav responseEnd | tiny fetch (3x) | 300 KB fetch |
|---|---|---|---|---|
| no emulation | 12-14 ms | 14-16 ms | 1-8 ms | 2 ms |
| emulation on `127.0.0.1` | 1 ms | 157-158 ms | 155-166 ms | 1688-1693 ms |
| emulation on `localhost` | 1-2 ms | 157 ms | 156-167 ms | 1690-1695 ms |

- Reading of that check: loopback requests are delayed and bandwidth-limited (300 KB at 200 KB/s is about 1.5 s plus latency; observed 1.69 s). The one thing that is not delayed is the navigation document's `responseStart`: the added latency shows up between `responseStart` and `responseEnd`. That is why `throttled.json` reported TTFB 26-50 ms under "150 ms" emulation.
- Real-app evidence inside `throttled.json` agrees: an 89 KB gzip script took 2.5-3.1 s on the wire, the 34 KB overview document ended at 358-432 ms, the 14.6 KB draft-editor document at 230-238 ms, and `load` landed at 2.7-3.6 s.
- Consequence: the throttled section below drops TTFB and reports document response end (`docEnd`) instead. Throttled results are therefore valid and were not re-run. The web app on :3000 was down when this check ran, so the real app was not re-measured; none of the other measurements needed it.
- Not done: Lighthouse-style simulated throttling (this is applied, DevTools-style throttling), and more than 2 samples per throttled route.

## 2. Environment, build and cache state

| Item | Value |
|---|---|
| Machine | Apple M1 Pro, 10 cores, 16 GB RAM, macOS 26.5.2 (arm64) |
| Browser | Playwright 1.56.1, Chromium 141.0.7390.37, headless, viewport 1440x900, `en-US`, `America/New_York`. No simulator or device. |
| Build | Next.js 16.2.7 (Turbopack) **production build** served by `next start` on `127.0.0.1:3000` (React 19.2.4). Built and started by `scripts/e2e-local.sh` on 2026-10-17 12:09 EDT (its log shows `next build`, compile 5.7 s, then `next start`). Not dev mode. |
| Backend | FastAPI on `127.0.0.1:8001`, local Supabase (Docker) on `127.0.0.1:54321`. Everything is loopback; 0 external requests on all 30 routes. |
| Repo | Audit started at `9928f536`; HEAD is `0279fd3`. `git diff --stat 9928f536 HEAD -- web` shows only `web/vercel.json` (+8), so the measured web code equals HEAD's web code for local purposes. The API process measured on Oct 17 predates the backend commits since then (the local API on :8001 now is a newer process), so the fan-out timings below describe the older backend. |
| Cold sample | A fresh browser context per sample: empty HTTP cache, no service worker, only the signed-in cookies. The server, API and database were already warm from earlier smoke/discovery passes. 3 samples per route (`cold.json`, 2026-10-17), 3 more for overview/data/Z-zone-draft-editor on 2026-10-18 (`recheck-cold.json`). |
| Warm navigation | One browser context, client-side `<Link>` clicks, measured from click to the destination's usable predicate. Pass 1 is the first time that context visits the transition (route chunks uncached); pass 2 repeats the chain with chunks cached. 3 contexts per transition (`warm-nav.json`). |
| Fan-out | Raw HTTP GETs of the page document with the session cookies (no browser, so no client prefetch noise) while tailing the API access log (operation, status, duration only). 3 runs per page (`api-fanout.json`). |
| Usable | `usable` = first animation frame where the route's readiness predicate (table in section 3) is true. FCP, LCP, CLS and long tasks come from PerformanceObservers; request counts and bytes come from CDP `Network` events (encoded bytes on the wire). |

### Dataset sizes

| Workspace | At measurement time (2026-10-17) | Now (2026-10-18, `dataset-sizes.json`) |
|---|---|---|
| web-acceptance (`/o/web-acceptance/p/play-study`) | 10 sites (8 e2e-created, `empty-site`, `fall-creek`), 8 observations, 49 packages and 48 zone versions on `fall-creek` | 12 sites, 8 observations, 49 packages (all on `fall-creek`) |
| zone-review (`/o/zone-review-acceptance/p/zone-review`, routes prefixed `Z-`) | 28 sites, 520 observations (500 rendered per page), 2 form versions, 1 manager zone draft | 54 sites, 520 observations, 86 packages in 53 sites. Other audit steps' e2e runs added the extra sites, so `Z-overview`, `Z-sites`, `Z-qgis` would measure higher today. |
| Package archives | 1,652-2,485 bytes each (tiny synthetic ZIPs); a current-archive GET took 12-15 ms | same |

### Routes blocked or degraded by the stale local schema (`environment: stale local schema`)

- **Error state, so the numbers are for the error screen, not the real page:** `forms`, `forms-versions`, `forms-version` (all render "Couldn't load ..." after `getFormVersion`/`listForms` returned 500). The warm transition `site/zones->forms` also lands on the forms error screen.
- **Rendered, but with a failed form call in the fan-out, so form-dependent UI is degraded and the timings include a 17-55 ms failing call:** `overview` and `Z-overview` (`listForms` 500), `data`, `Z-data`, `reports`, `Z-reports` (`getFormVersion` 500, twice on the zone workspace).
- Not measured at all: the form editor, form publish, and any page behind a healthy form-version read. No migration was applied and nothing was reset.

## 3. Cold route results

Medians over 3 samples, with min-max in parentheses when they differ. Times are ms from navigation start. TTFB, FCP and LCP are valid here (no throttling). `Z-` rows use the zone-review workspace. The `forms`, `forms-versions` and `forms-version` rows measure the stale-schema error screen, not the real page (section 2).

| Route (id) | TTFB ms | FCP ms | LCP ms (element) | usable ms | load ms | CLS | long tasks (total ms / n) | HTML KB wire / decoded | DOM nodes | requests n / KB (js n/KB) |
|---|---|---|---|---|---|---|---|---|---|---|
| sign-in | 12 (7-37) | 52 (44-116) | 52 (44-116) (P) | 52 (44-116) | 71 (64-153) | 0 | 0 / 0 | 11 / 33 | 117 | 19 / 286 (14/200) |
| o | 57 (52-70) | 96 (92-124) | 336 (324-400) (H1#page-title) | 324 (312-400) | 283 (276-399) | 0 | 0 / 0 | 34 / 152 | 631 | 30 / 476 (24/366) |
| org | 25 (24-25) | 64 | 140 (136-140) (A) | 133 (131-134) | 93 (93-94) | 0 | 0 / 0 | 14 / 47 | 139 | 27 / 434 (22/344) |
| overview | 29 (28-39) | 64 (64-76) | 324 (320-324) (H1#page-title) | 310 (310-312) | 268 (257-270) | 0 | 0 / 0 | 34 / 152 | 631 | 29 / 476 (24/366) |
| data | 28 (26-30) | 64 (64-72) | 216 (212-348) (DIV) | 202 (198-331) | 132 (130-140) | 0 | 0 / 0 | 21 / 116 | 597 | 30 / 546 (25/449) |
| data-observation | 28 (27-33) | 64 (60-72) | 180 (172-188) (DIV) | 165 (159-175) | 105 (95-119) | 0 | 0 / 0 | 21 / 83 | 287 | 29 / 460 (24/363) |
| forms | 25 (25-27) | 60 | 152 (152-164) (DIV) | 146 (142-156) | 92 (90-95) | 0 | 0 / 0 | 14 / 52 | 161 | 28 / 441 (23/352) |
| forms-versions | 32 (22-33) | 64 (60-68) | 156 (156-160) (H1#page-title) | 149 (148-153) | 91 (89-91) | 0 | 0 / 0 | 14 / 52 | 161 | 28 / 439 (23/350) |
| forms-version | 32 (28-34) | 68 (68-72) | 160 (156-160) (DIV) | 152 (151-153) | 98 (93-110) | 0 | 0 / 0 | 14 / 53 | 163 | 30 / 462 (25/373) |
| sites | 32 (29-44) | 68 (64-84) | 180 (176-192) (DIV) | 170 (164-181) | 101 (96-114) | 0 | 0 / 0 | 17 / 84 | 404 | 29 / 451 (24/359) |
| site | 27 (25-34) | 68 (60-68) | 184 (180-184) (H1#page-title) | 171 (169-172) | 111 (96-119) | 0 | 0 / 0 | 20 / 80 | 316 | 30 / 536 (25/441) |
| zones | 29 (27-30) | 72 (68-72) | 336 (H1#page-title) | 326 (323-326) | 208 (205-216) | 0 | 0 / 0 | 71 / 306 | 1249 | 30 / 590 (25/443) |
| packages | 33 (24-38) | 72 (68-84) | 328 (180-332) (DIV) | 318 (172-321) | 148 (136-221) | 0 | 0 / 0 | 23 / 252 | 2113 | 31 / 554 (26/455) |
| reports | 35 (23-77) | 76 (60-116) | 164 (148-204) (P) | 158 (141-192) | 149 (132-194) | 0 | 0 / 0 | 16 / 67 | 287 | 28 / 444 (23/352) |
| qgis | 26 (25-29) | 68 (60-68) | 184 (176-184) (P) | 169 (163-172) | 109 (96-116) | 0 | 0 / 0 | 17 / 90 | 510 | 29 / 515 (24/422) |
| team | 39 (37-51) | 80 (80-92) | 184 (184-208) (DIV) | 175 (175-194) | 112 (108-147) | 0 | 0 / 0 | 17 / 84 | 347 | 28 / 447 (23/354) |
| project-settings | 32 (28-32) | 68 (60-76) | 160 (76-160) (DIV) | 149 (76-150) | 107 (101-112) | 0 | 0 / 0 | 22 / 90 | 654 | 28 / 447 (23/350) |
| account | 31 (27-37) | 72 | 72 (P) | 72 | 95 (91-96) | 0 | 0 / 0 | 14 / 55 | 240 | 22 / 335 (17/246) |
| org-members | 35 (31-41) | 68 | 68 (H3) | 68 | 111 (108-117) | 0 | 0 / 0 | 11 / 41 | 120 | 27 / 437 (22/350) |
| org-settings | 28 (28-34) | 72 (64-84) | 72 (64-84) (H3) | 72 (64-84) | 102 (94-115) | 0 | 0 / 0 | 11 / 41 | 120 | 27 / 434 (22/347) |
| Z-overview | 26 (26-36) | 68 (68-80) | 488 (476-508) (DIV) | 541 (531-566) | 540 (521-563) | 0 | 0 / 0 | 32 / 160 | 695 | 29 / 473 (24/366) |
| Z-data | 34 (31-41) | 68 (68-76) | 840 (836-856) (DIV) | 806 (802-822) | 658 (652-666) | 0 | 114 / 1 | 55 / 2215 | 15213 | 30 / 580 (25/449) |
| Z-data-observation | 26 (26-26) | 68 (64-68) | 332 (328-332) (DIV) | 315 (310-317) | 156 (147-166) | 0 | 0 / 0 | 22 / 84 | 293 | 29 / 460 (24/363) |
| Z-sites | 25 (25-30) | 64 (60-68) | 328 (320-328) (DIV) | 313 (311-319) | 176 (174-187) | 0 | 0 / 0 | 21 / 161 | 871 | 29 / 455 (24/359) |
| Z-site | 36 (27-44) | 76 (68-88) | 332 (324-376) (H1#page-title) | 314 (308-369) | 282 (260-362) | 0 | 0 / 0 | 19 / 78 | 314 | 30 / 535 (25/441) |
| Z-zones | 28 (26-33) | 64 (64-72) | 324 (320-328) (H1#page-title) | 311 (310-313) | 240 (237-249) | 0 | 0 / 0 | 26 / 109 | 365 | 30 / 545 (25/443) |
| Z-zone-draft-editor | 31 (27-57) | 68 (64-104) | 320 (312-356) (H1#page-title) | 365 (361-419) | 239 (229-349) | 0 | 0 / 0 | 15 / 60 | 398 | 35 / 562 (28/470) |
| Z-packages | 28 (24-33) | 76 (64-92) | 324 (312-328) (DIV) | 318 (304-319) | 169 (167-190) | 0 | 0 / 0 | 17 / 70 | 280 | 31 / 548 (26/455) |
| Z-reports | 30 (27-31) | 68 (68-72) | 552 (540-568) (DIV) | 542 (533-558) | 541 (535-544) | 0 | 0 / 0 | 24 / 288 | 607 | 28 / 452 (23/352) |
| Z-qgis | 28 (27-31) | 72 (64-72) | 336 (328-336) (P) | 325 (317-327) | 211 (200-216) | 0 | 0 / 0 | 21 / 190 | 1186 | 29 / 518 (24/422) |

Request breakdown (count / KB on the wire, medians; all requests are same-origin or loopback):

| Route | doc n/KB | JS n/KB | CSS n/KB | fonts n/KB | image n/KB | browser→API :8001 n/KB | TOTAL n/KB | external hosts |
|---|---|---|---|---|---|---|---|---|
| sign-in | 1/11 | 14/200 | 1/13 | 2/61 | 1/1 | 0 | 19/286 | 0 |
| o | 2/36 | 24/366 | 1/13 | 2/61 | 1/1 | 0 | 30/476 | 0 |
| org | 1/15 | 22/344 | 1/13 | 2/61 | 1/1 | 0 | 27/434 | 0 |
| overview | 1/35 | 24/366 | 1/13 | 2/61 | 1/1 | 0 | 29/476 | 0 |
| data | 1/22 | 25/449 | 1/13 | 2/61 | 1/1 | 0 | 30/546 | 0 |
| data-observation | 1/22 | 24/363 | 1/13 | 2/61 | 1/1 | 0 | 29/460 | 0 |
| forms | 1/15 | 23/352 | 1/13 | 2/61 | 1/1 | 0 | 28/441 | 0 |
| forms-versions | 1/15 | 23/350 | 1/13 | 2/61 | 1/1 | 0 | 28/439 | 0 |
| forms-version | 1/15 | 25/373 | 1/13 | 2/61 | 1/1 | 0 | 30/462 | 0 |
| sites | 1/18 | 24/359 | 1/13 | 2/61 | 1/1 | 0 | 29/451 | 0 |
| site | 1/20 | 25/441 | 1/13 | 2/61 | 1/1 | 0 | 30/536 | 0 |
| zones | 1/72 | 25/443 | 1/13 | 2/61 | 1/1 | 0 | 30/590 | 0 |
| packages | 1/24 | 26/455 | 1/13 | 2/61 | 1/1 | 0 | 31/554 | 0 |
| reports | 1/17 | 23/352 | 1/13 | 2/61 | 1/1 | 0 | 28/444 | 0 |
| qgis | 1/18 | 24/422 | 1/13 | 2/61 | 1/1 | 0 | 29/515 | 0 |
| team | 1/18 | 23/354 | 1/13 | 2/61 | 1/1 | 0 | 28/447 | 0 |
| project-settings | 1/22 | 23/350 | 1/13 | 2/61 | 1/1 | 0 | 28/447 | 0 |
| account | 1/14 | 17/246 | 1/13 | 2/61 | 1/1 | 0 | 22/335 | 0 |
| org-members | 1/12 | 22/350 | 1/13 | 2/61 | 1/1 | 0 | 27/437 | 0 |
| org-settings | 1/12 | 22/347 | 1/13 | 2/61 | 1/1 | 0 | 27/434 | 0 |
| Z-overview | 1/33 | 24/366 | 1/13 | 2/61 | 1/1 | 0 | 29/473 | 0 |
| Z-data | 1/56 | 25/449 | 1/13 | 2/61 | 1/1 | 0 | 30/580 | 0 |
| Z-data-observation | 1/22 | 24/363 | 1/13 | 2/61 | 1/1 | 0 | 29/460 | 0 |
| Z-sites | 1/22 | 24/359 | 1/13 | 2/61 | 1/1 | 0 | 29/455 | 0 |
| Z-site | 1/20 | 25/441 | 1/13 | 2/61 | 1/1 | 0 | 30/535 | 0 |
| Z-zones | 1/27 | 25/443 | 1/13 | 2/61 | 1/1 | 0 | 30/545 | 0 |
| Z-zone-draft-editor | 1/15 | 28/470 | 1/13 | 2/61 | 1/1 | 1/2 | 35/562 | 0 |
| Z-packages | 1/18 | 26/455 | 1/13 | 2/61 | 1/1 | 0 | 31/548 | 0 |
| Z-reports | 1/25 | 23/352 | 1/13 | 2/61 | 1/1 | 0 | 28/452 | 0 |
| Z-qgis | 1/21 | 24/422 | 1/13 | 2/61 | 1/1 | 0 | 29/518 | 0 |

What the table says:

- **Layout stability:** CLS is 0.000 on all 30 routes in every sample.
- **Main-thread blocking:** long tasks are 0 on 29 of 30 routes. `Z-data` has one long task of 114-121 ms (TBT 64 ms) while parsing and hydrating a 2.2 MB decoded document with 15,213 DOM nodes (55 KB on the wire). It is also the slowest cold route (LCP 840, usable 806 ms).
- **Server shell is fast, content follows the fan-out:** TTFB is 12-57 ms and FCP 52-96 ms on every route. LCP and usable then track the server-side API fan-out (section 5): about 50-130 ms of calls on the small pages, 480-620 ms on `Z-overview`, `Z-data`, `Z-reports` because `listHistoricalObservations` takes 329-396 ms for 520 observations. The document is streamed: the first byte arrives at 25-58 ms while the document ends at 43-622 ms.
- **Largest documents:** `Z-data` 2.2 MB decoded (55 KB wire), `Z-reports` 288 KB decoded, `zones` 306 KB decoded / 1,249 DOM nodes, `packages` 252 KB decoded / 2,113 DOM nodes (49 package rows).
- **Heaviest by transfer:** `zones` 590 KB, `Z-data` 580 KB, `Z-zone-draft-editor` 562 KB (35 requests, the only route with a browser call to the API: one 1.9 KB draft re-read plus its CORS preflight), against 286 KB for `sign-in`. JS is 70-84% of every page's transfer (14-28 scripts); the two web fonts are a flat 61 KB.
- **Bimodal "usable" with identical server work (unexplained):** `data` was 198/202/331 ms in the first run and 312/317/338 ms in the recheck; `packages` 172/321/318 ms; `project-settings` 76/150/149 ms. Recheck of overview (310 -> 318 ms) and Z-zone-draft-editor (365 -> 359 ms) reproduced within 8 ms. Many routes sit on a 310-326 ms usable plateau (LCP 320-336 ms): `o`, `overview`, `zones`, `Z-sites`, `Z-site`, `Z-zones`, `Z-packages`, `Z-qgis`, `Z-data-observation`. The four of them with measured fan-out (overview, zones, Z-sites, Z-site) have document-end times of 147-255 ms, yet land on the same plateau. The installed `react-dom` has a 300 ms Suspense reveal throttle (`FALLBACK_THROTTLE_MS = 300` in `react-dom-client.development.js`), which would produce this floor (content that resolves after the streaming fallback has painted is held back about 300 ms from the fallback). That is a hypothesis consistent with the data; it was not tested because the web app was down when this was written.

Recheck on 2026-10-18 (3 samples each, same method, `recheck-cold.json`): overview usable 318 (316-319) vs 310 earlier; data 317 (312-338) vs 202 earlier; Z-zone-draft-editor 359 (358-364) vs 365 earlier. Request counts and bytes were identical to the first run.

### Route table (state and readiness selector)

`visible(sel)` means the element exists, has a non-zero box, and is not `display:none` or `visibility:hidden`.

| Route id | Path (uuid elided) | Rendered state | Usable = first rAF where this holds |
|---|---|---|---|
| sign-in | `/sign-in` | ok | `visible(input[type=password])&&visible(button[type=submit])` |
| o | `/o` | ok | `visible(main h1)&&visible(main dl)` |
| org | `/o/web-acceptance` | ok | `visible(main a[href*="/p/"])` |
| overview | `/o/<org>/p/<project>` | renders; listForms 500 in fan-out | `visible(main h1)&&visible(main dl)` |
| data | `/o/<org>/p/<project>/data` | renders; getFormVersion 500 in fan-out | `visible(main a[href*="/data/"])` |
| data-observation | `/o/<org>/p/<project>/data/<uuid>` | ok | `visible(main h1)&&visible(main dl)` |
| forms | `/o/<org>/p/<project>/forms` | ERROR STATE (stale schema 500) | `visible(main h1)` |
| forms-versions | `/o/<org>/p/<project>/forms/versions` | ERROR STATE (stale schema 500) | `visible(main h1)` |
| forms-version | `/o/<org>/p/<project>/forms/versions/1` | ERROR STATE (stale schema 500) | `visible(main h1)` |
| sites | `/o/<org>/p/<project>/sites` | ok | `visible(main a[href*="/sites/"])` |
| site | `/o/<org>/p/<project>/sites/fall-creek` | ok | `[...document.querySelectorAll('main svg[aria-label]')].some(s=>{const r=s.getBoundingClientRect();return r.width>300&&r.height>200})` |
| zones | `/o/<org>/p/<project>/sites/fall-creek/zones` | ok | `[...document.querySelectorAll('main svg[aria-label]')].some(s=>{const r=s.getBoundingClientRect();return r.width>300&&r.height>200})` |
| packages | `/o/<org>/p/<project>/sites/fall-creek/packages` | ok | `visible(main tbody tr)` |
| reports | `/o/<org>/p/<project>/reports` | renders; getFormVersion 500 in fan-out | `visible(main dl)` |
| qgis | `/o/<org>/p/<project>/qgis` | ok | `visible(main tbody tr)` |
| team | `/o/<org>/p/<project>/team` | ok | `document.querySelector('main')?.innerText.includes('Added')` |
| project-settings | `/o/<org>/p/<project>/settings` | ok | `visible(main form input)` |
| account | `/account` | ok | `visible(main form input)` |
| org-members | `/o/web-acceptance/members` | ok | `visible(main section)&&(document.querySelector('main')?.innerText.length>40)` |
| org-settings | `/o/web-acceptance/settings` | ok | `visible(main section)&&(document.querySelector('main')?.innerText.length>40)` |
| Z-overview | `/o/<org>/p/<project>` | renders; listForms 500 in fan-out | `visible(main h1)&&visible(main dl)` |
| Z-data | `/o/<org>/p/<project>/data` | renders; getFormVersion 500 in fan-out | `visible(main a[href*="/data/"])` |
| Z-data-observation | `/o/<org>/p/<project>/data/<uuid>` | ok | `visible(main h1)&&visible(main dl)` |
| Z-sites | `/o/<org>/p/<project>/sites` | ok | `visible(main a[href*="/sites/"])` |
| Z-site | `/o/<org>/p/<project>/sites/review-site` | ok | `[...document.querySelectorAll('main svg[aria-label]')].some(s=>{const r=s.getBoundingClientRect();return r.width>300&&r.height>200})` |
| Z-zones | `/o/<org>/p/<project>/sites/review-site/zones` | ok | `[...document.querySelectorAll('main svg[aria-label]')].some(s=>{const r=s.getBoundingClientRect();return r.width>300&&r.height>200})` |
| Z-zone-draft-editor | `/o/<org>/p/<project>/sites/review-site/zones/drafts/<uuid>` | ok | `[...document.querySelectorAll('main svg[aria-label]')].some(s=>{const r=s.getBoundingClientRect();return r.width>300&&r.height>200})` |
| Z-packages | `/o/<org>/p/<project>/sites/review-site/packages` | ok | `visible(main tbody tr)` |
| Z-reports | `/o/<org>/p/<project>/reports` | renders; getFormVersion 500 in fan-out | `visible(main dl)` |
| Z-qgis | `/o/<org>/p/<project>/qgis` | ok | `visible(main tbody tr)` |

## 4. Warm client-side navigation and prefetch

Warm "usable" is click to predicate. "RSC req" is the single `?_rsc=` request each navigation sends. Every transition was a soft navigation (no hard reload) in all 3 contexts and both passes.

| Workspace | Transition (client-side `<Link>` click) | usable ms, pass 1 (cold chunks) | usable ms, pass 2 (warm) | RSC req wire / decoded KB | RSC server TTFB / total ms (pass 2) | new JS on pass 1 (files / KB) | server→API calls | soft nav |
|---|---|---|---|---|---|---|---|---|
| web | overview->data | 345 (339-353) | 323 (320-328) | 3.1 / 13.8 | 5 / 106 | 2 / 93.9 | 7 | yes |
| web | data->observation | 101 (88-105) | 83 (81-96) | 5.1 / 16.6 | 6 / 73 | 1 / 7.1 | 5 | yes |
| web | observation->back(data) | 19 (14-20) | 15 (12-16) | 0 / 0 | 0 / 0 | 0 / 0 | 0 | yes |
| web | data->sites | 332 (328-335) | 327 (326-327) | 2.9 / 8.8 | 7 / 75 | 2 / 15.4 | 4 | yes |
| web | sites->site | 112 (110-120) | 86 (86-93) | 2.8 / 7.2 | 5 / 77 | 2 / 85.1 | 5 | yes |
| web | site->zones | 191 (173-228) | 198 (197-213) | 48.4 / 118.9 | 7 / 179 | 1 / 16.4 | 7 | yes |
| web | site/zones->forms | 331 (327-333) | 327 (324-332) | 1.8 / 4.1 | 5 / 64 | 1 / 8.5 | 4 | yes |
| zone | Z overview->data(500 rows) | 733 (685-1115) | 682 (618-773) | 12.8 / 418.6 | 6 / 538 | 2 / 93.9 | 8 | yes |
| zone | Z data->observation | 178 (152-221) | 185 (163-201) | 5.5 / 17.5 | 5 / 159 | 1 / 7.1 | 5 | yes |
| zone | Z observation->back(data) | 152 (149-166) | 139 (130-141) | 0 / 0 | 0 / 0 | 0 / 0 | 0 | yes |
| zone | Z data->sites(28) | 411 (395-424) | 392 (389-395) | 6 / 31.8 | 5 / 153 | 2 / 15.4 | 9 | yes |
| zone | Z sites->site | 238 (238-275) | 229 (190-254) | 2.7 / 6.9 | 7 / 219 | 2 / 85.1 | 5 | yes |
| zone | Z site->zones | 229 (211-243) | 241 (215-275) | 8 / 29.8 | 9 / 223 | 1 / 16.4 | 7 | yes |
| zone | Z zones->draft editor | 254 (254-280) | 243 (242-266) | 2.5 / 7.2 | 5 / 193 | 5 / 114.3 | 7 | yes |

- **Prefetch is switched off by design.** The prefetch probe (overview, 31 internal links) saw 0 RSC requests after load and idle, 0 after scrolling to the bottom, and 0 after hovering two links. In the source, 20 of 29 `<Link>` elements set `prefetch={false}` (the shared `TextLink` defaults to false) and the other 9 are on the legal pages. So every tab or row navigation pays a full server render plus RSC round trip: 4-9 server-to-API calls, RSC server TTFB 5-9 ms but RSC total 64-538 ms.
- **Back navigation is free:** `observation->back(data)` sends 0 requests and is usable in 12-20 ms on the web workspace and 130-166 ms on the zone workspace (client-side only, no network; the 500 rows are re-rendered).
- **Biggest warm transitions:** `Z overview->data(500 rows)` 618-1115 ms usable (RSC 12.8 KB on the wire, 419 KB decoded, 538 ms total) and `Z data->sites(28)` 389-424 ms.
- **~330 ms floor on three transitions:** `overview->data` (320-353), `data->sites` (326-335) and `site/zones->forms` (324-333) are usable about 215-270 ms after their RSC response finished (64-125 ms), while `data->observation` (81-105) and `sites->site` (86-120) are usable within about 10-25 ms of it. Same unexplained pattern and same hypothesis as the cold plateau in section 3; not diagnosed.
- **The same supabase code is downloaded three times across a session.** Pass 1 pulls a different ~70 KB (gzip) copy of that library on the first soft navigation into `/data` (2 files, 93.9 KB), into `/sites/[site]` (2 files, 85.1 KB) and into the zone draft editor (5 files, 114.3 KB); see section 6. On loopback this costs milliseconds (pass 1 vs pass 2 medians differ by -12 to +51 ms), on a real network it is about 211 KB of gzip (3 x 70 KB) for one library.

## 5. Server to API fan-out per page

Document GET with cookies, 3 runs; "TTFB / total" is the server document's first byte and end of stream (ms). API figures come from the API's access log (operation, status, duration). Operation parameters are not logged, so identical-looking repeats cannot be classified as true duplicates. `(500)` is the stale-schema failure.

| Page | doc status | server doc TTFB / total ms (3 runs) | API calls (n) | sum of API ms | longest call ms | operations | sequential structure |
|---|---|---|---|---|---|---|---|
| o | 307/307/307 | 58/59, 40/43, 42/44 | 1/1/1 | 28/21/30 | 28/21/30 | get_identity | get_identity, then 307 to the project |
| overview | 200/200/200 | 51/255, 40/222, 36/203 | 19/19/19 | 784/666/770 | 115/102/99 | get_identity, getProject, listForms(500), listSites, listHistoricalObservations, listPackages x10, summarizeHistoricalObservations x3, downloadPackageArchive | get_identity > {getProject, listSites, listHistoricalObservations, listForms(500)} > listPackages for every site in parallel (N+1) > {summarizeHistoricalObservations x3, downloadPackageArchive}: 4 stages |
| data | 200/200/200 | 42/119, 29/123, 38/126 | 7/7/7 | 119/133/133 | 25/33/31 | get_identity, getProject, listSites, summarizeHistoricalObservations, listHistoricalObservations, getFormVersion(500), downloadPackageArchive | get_identity > {getProject, listSites} > {listHistoricalObservations, summarizeHistoricalObservations} > getFormVersion(500) > downloadPackageArchive: 5 stages |
| data-observation | 200/200/200 | 31/77, 42/81, 34/71 | 5/5/5 | 69/68/66 | 22/19/19 | get_identity, getHistoricalObservation, downloadPackageArchive, getProject, listSites | get_identity > getHistoricalObservation > {getProject, listSites, downloadPackageArchive}: 3 stages |
| site | 200/200/200 | 25/69, 25/69, 27/80 | 5/5/5 | 67/67/75 | 20/20/25 | get_identity, getProject, listSites, downloadPackageArchive, summarizeHistoricalObservations | get_identity > {getProject, listSites} > {downloadPackageArchive, summarizeHistoricalObservations}: 3 stages |
| zones | 200/200/200 | 37/189, 27/150, 33/160 | 7/7/7 | 232/193/198 | 78/64/67 | get_identity, getProject, listSites, listPackages, listZoneDrafts, downloadPackageArchive, getHistoricalZones | get_identity > {getProject, listSites} > {listZoneDrafts, listPackages} > {getHistoricalZones, downloadPackageArchive}: 4 stages |
| forms-version | 200/200/200 | 29/50, 43/66, 34/61 | 2/2/2 | 30/45/47 | 21/24/29 | get_identity, getFormVersion(500) | get_identity > getFormVersion(500): 2 stages |
| reports | 200/200/200 | 35/121, 38/117, 35/115 | 6/6/6 | 144/128/124 | 32/30/33 | get_identity, getProject, listSites, summarizeHistoricalObservations, listHistoricalObservations, getFormVersion(500) | get_identity > {getProject, listSites} > {summarizeHistoricalObservations, listHistoricalObservations} > getFormVersion(500): 4 stages |
| sites | 200/200/200 | 25/57, 36/72, 32/70 | 4/4/4 | 46/59/50 | 19/24/21 | get_identity, getProject, listSites, downloadPackageArchive | get_identity > {getProject, listSites} > downloadPackageArchive: 3 stages |
| packages | 200/200/200 | 26/111, 38/129, 30/120 | 4/4/4 | 95/113/99 | 58/58/59 | get_identity, getProject, listSites, listPackages | get_identity > {getProject, listSites} > listPackages: 3 stages |
| Z-overview | 200/200/200 | 31/507, 43/502, 34/478 | 37/37/37 | 4545/4468/4233 | 367/350/342 | get_identity, getProject, listForms(500), listSites, listPackages x28, listHistoricalObservations, summarizeHistoricalObservations x3, downloadPackageArchive | same 4 stages as overview; 28 parallel listPackages, listHistoricalObservations 350 ms holds up stage 3 |
| Z-data | 200/200/200 | 43/565, 40/553, 37/594 | 8/8/8 | 526/516/564 | 332/329/355 | get_identity, getProject, listSites, summarizeHistoricalObservations, listHistoricalObservations, getFormVersion(500) x2, downloadPackageArchive | same 5 stages as data; listHistoricalObservations 329 ms, then getFormVersion(500) x2 in parallel, then archive |
| Z-site | 200/200/200 | 28/199, 26/197, 31/193 | 5/5/5 | 190/190/187 | 86/83/84 | get_identity, getProject, listSites, downloadPackageArchive, summarizeHistoricalObservations | same 3 stages as site; listSites 83 ms and summarizeHistoricalObservations 81 ms |
| Z-zone-draft-editor | 200/200/200 | 37/197, 29/182, 44/198 | 6/6/6 | 178/175/184 | 89/86/87 | get_identity, getProject, listSites, getZoneDraft, downloadPackageArchive, getHistoricalZones | get_identity > {getProject, listSites} > getZoneDraft > {getHistoricalZones, downloadPackageArchive}: 4 stages |
| Z-sites | 200/200/200 | 38/158, 40/147, 51/177 | 9/9/9 | 207/181/210 | 92/84/100 | get_identity, getProject, listSites, downloadPackageArchive x6 | get_identity > {getProject, listSites} > downloadPackageArchive x6 in parallel: 3 stages |
| Z-reports | 200/200/200 | 34/622, 41/557, 32/561 | 7/7/7 | 660/577/582 | 396/368/386 | get_identity, getProject, listSites, summarizeHistoricalObservations, listHistoricalObservations, getFormVersion(500) x2 | same 4 stages as reports; listHistoricalObservations 368 ms, then getFormVersion(500) x2 |

What the fan-out shows:

- **Every page starts with a serial auth hop.** `get_identity` (9-30 ms) runs before any project call on all 16 pages measured, then `getProject` + `listSites` run in parallel, then page-specific calls. Pages have 1-5 sequential stages; the `data` page has 5, with `getFormVersion` waiting on the observation list and the archive fetch last.
- **N+1 on the overview.** `listPackages` is called once per site: 10 calls on the web workspace (18-115 ms each, 203-255 ms document), 28 calls on the zone workspace (34-244 ms each, 4.2-4.5 s of summed API time inside a 478-507 ms document). All of them wait for `listSites`; `summarizeHistoricalObservations` x3 and the archive fetch wait for all of them. It grows with the number of sites (the zone workspace has 54 sites now, so it would be worse today).
- **Possible duplicates (not provable from the log):** `summarizeHistoricalObservations` x3 on both overviews; `getFormVersion` x2 on `Z-data` and `Z-reports` (two form versions); `downloadPackageArchive` x6 on `Z-sites`. React `cache()` is per request, so nothing is shared between requests.
- **Archive downloads:** `downloadPackageArchive` happens once per render on overview, data, data-observation, site, sites, zones and the draft editor (6 in parallel on `Z-sites`); the server fetches the ZIP and unzips it with `fflate` to draw a site plan. In this seed each archive is 1.65-2.5 KB and the API takes 6-18 ms for it, so the cost here is negligible; real packages may be up to 24 MiB (`next.config.ts` comment), so this measurement says nothing about real archive cost.
- **Slowest single calls:** `listHistoricalObservations` 329-396 ms on 520 observations (23-44 ms on 8), `listZoneDrafts` 64 ms, `listPackages` 58 ms on one site with 49 packages.
- **Streaming:** server TTFB (25-58 ms) is far below document end (50-622 ms), so the shell ships before the fan-out completes; the fan-out sets when LCP can happen.

## 6. Static bundle facts (`static-bundle.json`, `chunk-modules.json`, `module-inventory.json`)

- **Build output:** 79 JS chunk files, 3,683 KB raw / 1,120 KB gzip across the whole app (not what any one page loads). One CSS file of 67 KB raw / 12.8 KB gzip (13.2 KB on the wire) on every page, 2 woff2 fonts (61 KB).
- **Shared framework chunks:** 6 files, 556 KB raw / 167 KB gzip (react-dom 227 KB raw / 71 KB gzip, Next runtime 144 KB / 39 KB, a 110 KB / 39 KB app-shared chunk).
- **Estimated first-load JS per route** (gzip, app + framework; measured cold-run transfer is 2-9% below it: overview 366 KB, data 449, site 441, zones 443, packages 455, draft editor 470, sign-in 200, account 246):

| Route | JS files | app JS gzip KB | first-load JS gzip KB (app + framework) | first-load JS br KB (app only) | first-load raw KB | route-only chunks (raw KB) |
|---|---|---|---|---|---|---|
| `/(app)/o/[org]/p/[project]/sites/[site]/zones/drafts/[draft]` | 18 | 313 | 480 | 267 | 1668 | 16+39+26+265+34+42 |
| `/(app)/o/[org]/p/[project]/sites/[site]/packages` | 16 | 299 | 466 | 255 | 1627 | 34+37+45+265 |
| `/(app)/o/[org]/p/[project]/sites/[site]/zones/drafts/[draft]/publish` | 16 | 299 | 466 | 254 | 1630 | 30+55+34+265 |
| `/(app)/o/[org]/p/[project]/data` | 15 | 294 | 461 | 250 | 1614 | 34+265+68 |
| `/(app)/o/[org]/p/[project]/sites/[site]/zones` | 15 | 287 | 455 | 244 | 1593 | 34+265+48 |
| `/(app)/o/[org]/p/[project]/sites/[site]` | 15 | 285 | 452 | 242 | 1585 | 34+265+39 |
| `/(app)/o/[org]/p/[project]/qgis` | 14 | 267 | 434 | 226 | 1533 | 21+265 |
| `/(app)/o/[org]/p/[project]/forms/versions/[version]` | 15 | 217 | 385 | 185 | 1330 | 12+34+38 |
| `/(app)/o/[org]/p/[project]` | 14 | 211 | 378 | 179 | 1308 | 28+34 |
| `/(app)/o/[org]/p/[project]/data/[observation]` | 14 | 208 | 375 | 177 | 1298 | 18+34 |
| `/(app)/o/[org]/p/[project]/sites` | 14 | 204 | 371 | 173 | 1286 | 14+26 |
| `/dev/contour` | 12 | 200 | 368 | 170 | 1285 | 26+23+25+25+34+26+43+382+17+71 |
| `/(app)/o/[org]/p/[project]/team` | 13 | 200 | 367 | 169 | 1277 | 31 |
| `/(app)/o/[org]/(org)/members` | 13 | 199 | 366 | 169 | 1276 | 30 |
| `/(app)/o/[org]/p/[project]/reports` | 13 | 198 | 365 | 168 | 1271 | 25 |
| `/(app)/o/[org]/p/[project]/forms` | 13 | 197 | 364 | 167 | 1268 | 22 |
| `/(app)/o/[org]/(org)/settings` | 13 | 196 | 363 | 166 | 1264 | 19 |
| `/(app)/o/[org]/p/[project]/settings` | 13 | 196 | 363 | 166 | 1264 | 18 |
| `/(app)/o/[org]/p/[project]/forms/versions` | 13 | 195 | 362 | 165 | 1262 | 16 |
| `/(app)/o/[org]/p/[project]/forms/versions/[version]/publish` | 13 | 194 | 362 | 165 | 1261 | 15 |
| `/(app)/o/[org]/(org)` | 13 | 193 | 360 | 163 | 1256 | 10 |
| `/dev/zone-editor` | 11 | 190 | 357 | 161 | 1245 | 32+30+17+25+26+42+44+382+34 |
| `/(app)/o/[org]/collect` | 11 | 187 | 354 | 158 | 1242 | 0 |
| `/(app)/o` | 11 | 187 | 354 | 158 | 1242 | 23+382+43 |
| `/(auth)/(join)/join` | 8 | 148 | 316 | 124 | 1128 | 33+382 |
| `/(auth)/(join)/invite` | 8 | 147 | 314 | 122 | 1123 | 28+382 |
| `/(app)/account` | 10 | 101 | 269 | 89 | 869 | 23+53 |
| `/(auth)/(signed-out)/sign-up` | 7 | 55 | 222 | 48 | 733 | 23 |
| `/(auth)/(signed-out)/reset-password` | 7 | 54 | 221 | 47 | 729 | 19 |
| `/(auth)/(signed-out)/verify` | 7 | 53 | 220 | 46 | 725 | 15 |
| `/(auth)/(signed-out)/sign-in` | 7 | 53 | 220 | 46 | 725 | 15 |
| `/(auth)/(signed-out)/forgot-password` | 7 | 52 | 219 | 45 | 723 | 13 |
| `/(marketing)` | 3 | 23 | 191 | 21 | 638 | 25 |
| `/(legal)/privacy/delete-data` | 3 | 21 | 189 | 19 | 633 | 0 |
| `/(legal)/privacy` | 3 | 21 | 189 | 19 | 633 | 0 |
| `/(app)/o/[org]/[...missing]` | 0 | 0 | 167 | 0 | 556 | 0 |
| `/_global-error` | 0 | 0 | 167 | 0 | 556 | 0 |
| `/_not-found` | 0 | 0 | 167 | 0 | 556 | 0 |

Floors: `/_not-found` 167 KB (framework only); marketing/legal 189-191 KB; signed-out auth pages 219-222 KB; `/account` 269 KB; join/invite 314-316 KB; every other signed-in page 354 KB or more.
- **Largest chunks** (the package column is a regex heuristic on chunk contents; `package.json` has no maplibre or turf dependency, so those two tags are app code):

| Chunk | raw KB | gzip KB | br KB | package |
|---|---|---|---|---|
| 0wstr41mffx5k.js | 382 | 89 | 72 | zod |
| 159n5qswl4qfq.js | 265 | 70 | 59 | supabase, react-dom, next_runtime |
| 2d013804da0kj.js | 265 | 70 | 59 | supabase, react-dom, next_runtime |
| 3-dr7pv7v6of6.js | 265 | 70 | 59 | supabase, react-dom, next_runtime |
| 1zz4_vykseajt.js | 227 | 71 | 61 | react-dom, next_runtime |
| 10uv514i7spsv.js | 144 | 39 | 33 | next_runtime |
| 0cz1d0mv5g_q7.js | 110 | 39 | 34 | app code |
| 2-a1y-yt3-dt-.js | 71 | 22 | 19 | radix, lucide |
| 0mdkekfyzteng.js | 68 | 23 | 20 | radix, turf_or_geo, date/intl |
| 2iasyrjcf6y8k.js | 55 | 17 | 15 | date/intl |
| 1z3z_fx6b_867.js | 53 | 13 | 11 | app code |
| 2v_khxek_ypmj.js | 53 | 17 | 15 | supabase, next_runtime |
| 126ibiuddydfg.js | 48 | 16 | 14 | radix, date/intl |
| 1w1krmgd0n7nn.js | 45 | 15 | 13 | turf_or_geo |
| 1i9f2af4ujan8.js | 44 | 16 | 14 | maplibre, cmdk, radix |

- **zod ships on every project page:** the 382 KB raw / 89 KB gzip chunk `0wstr41mffx5k.js` holds zod 4 (356 KB of module source) plus `openapi-fetch`. It is loaded by every authenticated project and org page, but not by `sign-in` or `/account`.
- **`@supabase/supabase-js` is bundled three times:** one 226 KB module (+22 KB buffer polyfill) appears in three chunks of 265 KB raw / about 70 KB gzip each (`159n5qswl4qfq.js`, `2d013804da0kj.js`, `3-dr7pv7v6of6.js`). Each route group loads exactly one: `data` and `Z-data` load `2d013804da0kj`, `site` / `zones` / `packages` / `qgis` load `3-dr7pv7v6of6`, the zone draft editor loads `159n5qswl4qfq`. Browser cache is therefore not shared between those groups (section 4).
- **Duplication overall:** `module-inventory.json` (source characters of module functions, not bytes on the wire) counts 1,794 KB of unique module source and 3,285 KB with copies, so 1,490 KB (45%) is duplicate copies across chunks. Unique source by library: zod 356 KB, react-dom 230 KB, supabase-js 226 KB (677 KB as built), radix-ui 110 KB (295 KB as built), buffer polyfill 22 KB (66 KB as built), cmdk 20 KB, openapi-fetch 6 KB. Application code is 775 KB unique and 1,534 KB as built (362 modules).
- Other dependencies in play (`web/package.json`): `@supabase/ssr` 0.12.7, `fflate` 0.8.2, `lucide-react`, `radix-ui`, `cmdk`, `zod` ^4.6.5, `next` 16.2.7.

## 7. Throttled results (150 ms latency, 1.6 Mbps down, 750 Kbps up, CPU 4x; 2 samples; valid, TTFB omitted)

Chromium 141, headless, production build, run on 2026-10-18. These are applied (DevTools-style) throttling numbers, not Lighthouse simulated throttling. Only 6 routes were run: `overview`, `data`, `site` and `zones` (web workspace) and `Z-data` and `Z-zone-draft-editor` (zone workspace). `docEnd` is document response end, the valid stand-in for TTFB.

| Route | docEnd ms (response end) | FCP ms | LCP ms | usable ms | load ms | long tasks (ms / n) | TBT ms | req n / KB | cold usable ms (same route, unthrottled) |
|---|---|---|---|---|---|---|---|---|---|
| overview | 395 (358-432) | 822 (756-888) | 822 (756-888) | 822 (756-888) | 2762 (2735-2790) | 328 / 3 | 110 | 29 / 476 | 310 |
| data | 275 (275-275) | 768 (760-776) | 768 (760-776) | 768 (760-776) | 3120 (3119-3121) | 321 / 3 | 122 | 30 / 546 | 202 |
| site | 260 (260-260) | 716 | 716 | 716 | 3106 (3101-3112) | 283 / 3 | 128 | 30 / 536 | 171 |
| zones | 1129 (1129-1130) | 766 (760-772) | 1214 (1208-1220) | 1182 (1182-1182) | 3321 (3321-3322) | 222 / 2.5 | 97 | 30 / 590 | 326 |
| Z-data | 1385 (1324-1445) | 716 (704-728) | 1776 (1712-1840) | 1709 (1645-1772) | 3541 (3475-3606) | 944 / 6 | 643 | 30 / 580 | 806 |
| Z-zone-draft-editor | 234 (230-238) | 698 (696-700) | 2044 (700-3388) | 3628 (3617-3639) | 3400 (3388-3411) | 274 / 3 | 124 | 35 / 562 | 365 |

- **FCP is 700-820 ms on every route** (document 15-71 KB, 13 KB CSS and two preloaded fonts over a 200 KB/s link), against 64-72 ms unthrottled for the same six routes. SSR keeps FCP independent of the 366-470 KB of JavaScript.
- **JavaScript arrives late:** `load` is 2.7-3.6 s; an 89 KB gzip chunk took 2.5-3.1 s on the wire. Request counts and bytes equal the cold run (29-35 requests, 476-590 KB).
- **Slowest route is the draft editor:** usable at 3.6 s (3,617-3,639 ms) against 365 ms unthrottled, with LCP at 700 ms in one sample and 3,388 ms in the other (the readiness predicate, a map larger than 300x200, only holds after the scripts load and hydrate). `Z-data` is usable at 1.7 s with 944 ms of long tasks in 6 tasks (TBT 643 ms) from rendering 15,213 DOM nodes at 4x CPU.
- **Other routes** show 2-3 long tasks (222-328 ms in total, TBT 97-128 ms) under 4x CPU against none unthrottled.

## 8. Not done and limits

- Nothing that already existed was re-measured; this pass added only the throttle-validity check (section 1), the dataset-size probe (section 2) and this summary. Fan-out and static-bundle figures are from the Oct 17 measurement (older API process; web code unchanged since).
- Forms routes and all form-version-dependent pages could not be measured healthily (section 2).
- Dataset sizes at measurement time for the zone workspace (28 sites) differ from now (54); do not extrapolate the `Z-` fan-out to today's data.
- 2-3 samples per cell; ranges are small samples, not distributions. No dev-mode, simulator, mobile-device or field data. Mobile (Expo) was not measured here.
- Cause of the 310-336 ms plateau and of the 330 ms warm-navigation floor was not proven (hypothesis in section 3).

## 9. Repository state

`git status --porcelain` was empty at the start and at the end of this run; no tracked file was modified. New files were written only under `outputs/frontend-audit-2026-10-17/perf/` (`SUMMARY.md`, `PROGRESS.md` updates, `dataset-sizes.json`, `throttle-validity.log`, `throttle-validity.cjs.txt`). The dataset probe signed in as the seeded local manager accounts through the loopback API (read-only GETs; no credentials or tokens were printed or stored).
