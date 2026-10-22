// Skeptic C04 reproduction: Read project with a .qgz that holds the three Fall Creek vector layers plus
// one XYZ basemap (as the lab's DECA_FALCR26001.qgz does, per qgis/fall-creek/qgis_project.py), then
// press Upload. A refused upload writes nothing; no successful upload is attempted.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const require = createRequire("/home/user/deca-mark/web/package.json");
const { chromium } = require("@playwright/test");
const { strToU8, zipSync } = require("fflate");

const OUT = "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/w3/skeptic-C04";
const BASE = "http://127.0.0.1:3000";
const PROJECT = "/o/web-acceptance/p/play-study";
const DIR = "/home/user/deca-mark/qgis/fall-creek/upload-sample/";
const LAYERS = ["ground", "zones", "trees"];
const variant = process.argv[2] ?? "xyz"; // xyz | none

const xyz =
	variant === "xyz"
		? `<maplayer type="raster"><layername>ESRI World Imagery</layername><provider>wms</provider><datasource>crs=EPSG:3857&amp;format&amp;type=xyz&amp;url=https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/%7Bz%7D/%7By%7D/%7Bx%7D&amp;zmax=19&amp;zmin=0</datasource></maplayer>`
		: "";
const qgs = `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis><title>Fall Creek</title><projectlayers>${LAYERS.map(
	l => `<maplayer type="vector"><layername>${l}</layername><provider>ogr</provider><datasource>${l}.geojson</datasource></maplayer>`
).join("")}${xyz}</projectlayers></qgis>`;
const qgz = Buffer.from(
	zipSync({
		"fall-creek.qgs": strToU8(qgs),
		...Object.fromEntries(LAYERS.map(l => [`${l}.geojson`, readFileSync(`${DIR}${l}.geojson`)]))
	})
);

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: "/home/user/deca-mark/web/e2e/.auth/manager.json" });
const page = await context.newPage();
const responses = [];
page.on("response", async response => {
	if (response.request().method() === "POST" && response.status() >= 400) {
		let body = "";
		try {
			body = (await response.text()).slice(0, 800);
		} catch {}
		responses.push({ url: new URL(response.url()).pathname, status: response.status(), body });
	}
});
await page.goto(`${BASE}${PROJECT}/sites/fall-creek/packages?step=upload`);
console.log("url after goto:", new URL(page.url()).pathname);
await page
	.getByLabel("QGIS project and source files", { exact: true })
	.setInputFiles({ name: "fall-creek.qgz", mimeType: "application/zip", buffer: qgz });
await page.getByRole("button", { name: "Read project", exact: true }).click();
const note = page.getByText(/layers? read\. Nothing saved yet\./);
await note.waitFor({ timeout: 60_000 });
const noteText = await note.locator("xpath=ancestor::*[self::div or self::section][1]").innerText();
console.log("READ PROJECT NOTE:\n" + noteText);
// Keep zone A as the current zone A (as the e2e does).
const choice = page.getByLabel("Zone A is", { exact: true });
const options = await choice.locator("option").evaluateAll(os => os.map(o => ({ v: o.value, t: o.textContent })));
const keep = options.find(o => o.v && !/new/i.test(o.t ?? ""));
await choice.selectOption(keep.v);
const checklist = await page.getByRole("main").innerText();
const upload = page.getByRole("button", { name: "Upload package", exact: true });
console.log("upload enabled:", await upload.isEnabled());
await upload.click();
const alert = page.getByText(/^Not uploaded\./);
await alert.first().waitFor({ timeout: 60_000 }).catch(() => {});
const shown = (await alert.allInnerTexts()).join(" | ");
console.log("SHOWN AFTER UPLOAD:", shown || "(no 'Not uploaded' text)");
console.log("FAILED POSTS:", JSON.stringify(responses, null, 1));
const main = await page.getByRole("main").innerText();
writeFileSync(`${OUT}/main-after-upload-${variant}.txt`, main);
writeFileSync(`${OUT}/main-before-upload-${variant}.txt`, checklist);
await page.screenshot({ path: `${OUT}/after-upload-${variant}.png`, fullPage: true });
await browser.close();
