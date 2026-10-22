const { chromium } = require('/home/user/deca-mark/web/node_modules/@playwright/test');
const fs = require('fs');
const F = '/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms';
const BASE = 'http://127.0.0.1:3000';
const WA = JSON.parse(fs.readFileSync('/home/user/deca-mark/database/.local/web-workspace.json', 'utf8'));
const ZR = JSON.parse(fs.readFileSync('/home/user/deca-mark/database/.local/zone-review.json', 'utf8'));
// Public seed password for local synthetic accounts (declared in web/e2e/support/auth.ts); read, never printed.
const PASSWORD = /PASSWORD = "([^"]+)"/.exec(fs.readFileSync('/home/user/deca-mark/web/e2e/support/auth.ts', 'utf8'))[1];
const WA_PATH = WA.path; // /o/web-acceptance/p/play-study
const ZR_PATH = ZR.path;
const launch = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: [] });
const VP = { desk: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
async function signIn(browser, email, file) {
  const ctx = await browser.newContext({ viewport: VP.desk, locale: 'en-US', timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForFunction(() => document.cookie.includes('auth-token') || true);
  for (let i = 0; i < 60; i++) { const c = await ctx.cookies(); if (c.some(x => /^sb-.+-auth-token/.test(x.name))) break; await page.waitForTimeout(500); }
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(1500);
  await ctx.storageState({ path: file });
  await ctx.close();
}
function stateFile(name) { return `${F}/state/${name}.json`; }
async function ctxFor(browser, name, vp = 'desk', extra = {}) {
  return browser.newContext({ storageState: stateFile(name), viewport: VP[vp], locale: 'en-US', timezoneId: 'America/New_York', deviceScaleFactor: vp === 'phone' ? 2 : 1, isMobile: vp === 'phone', hasTouch: vp === 'phone', ...extra });
}
function log(...a) { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log(s); }
module.exports = { chromium, fs, F, BASE, WA, ZR, WA_PATH, ZR_PATH, launch, VP, signIn, stateFile, ctxFor, log };
async function snap(page, name, { full = true } = {}) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${F}/shots/${name}.png`, fullPage: full });
  const txt = await page.locator('body').innerText().catch(() => '');
  fs.writeFileSync(`${F}/data/${name}.txt`, txt);
  return txt.replace(/\n+/g, ' | ');
}
module.exports.snap = snap;
