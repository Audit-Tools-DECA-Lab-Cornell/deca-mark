// Reproduces RN 0.86.3 KeyboardAvoidingView padding arithmetic (KeyboardAvoidingView.js:97-110, :129)
// against the frames measured in the iOS 26.5 iPhone 17 Pro simulator run (PROGRESS.md, screenshots 14/16d).
// The formula is read from the installed module so this script fails if it changes.
import { readFileSync } from "node:fs";
const src = readFileSync("/home/user/deca-mark/mobile/node_modules/react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js", "utf8");
if (!src.includes("return Math.max(frame.y + frame.height - keyboardY, 0);")) throw new Error("KAV formula changed");
if (!src.includes("this._frame = event.nativeEvent.layout;")) throw new Error("KAV frame source changed");
// onLayout layout.y is relative to the parent view; keyboard screenY is window-relative.
const pad = ({ frameY, frameH, kbTop, offset = 0 }) => Math.max(frameY + frameH - (kbTop - offset), 0);

console.log("== iPhone 17 Pro portrait (402x874), measured ==");
const winBottom = 874 - 34;            // SafeAreaView bottom edge
const bodyTop = 418 * 874 / 2000;      // map frame top in screenshot 14 (display px -> pt) = 182.7
const panelTop = 1290 * 874 / 2000 - 8; // acts bar (y 563.7) minus its paddingTop s2
const kbTop = 539;                      // a11y keyboard frame top (16d)
const restFooter = [711, 767];          // Back/Continue at rest (14), a11y
const fromBottom = restFooter.map((y) => winBottom - y); // offsets from the content-box bottom
const show = (label, p, frameH) => {
  const bottom = winBottom - p;
  if (frameH - p < 140) { console.log(`${label}: padding ${p.toFixed(0)} pt leaves a ${Math.max(frameH - p, 0).toFixed(0)} pt content box; the fixed rows (~128 pt) overflow and nothing is usable`); return; }
  const bc = fromBottom.map((o) => +(bottom - o).toFixed(0));
  console.log(`${label}: padding ${p.toFixed(0)} pt; content box ends at ${bottom.toFixed(0)}; Back/Continue y ${bc[0]}-${bc[1]}; keyboard top ${kbTop} -> ${bc[1] <= kbTop ? "ABOVE keyboard" : "BEHIND keyboard"}`);
};
show("current (map 46%, parent-relative frame)", pad({ frameY: panelTop - bodyTop, frameH: winBottom - panelTop, kbTop }), 999);
console.log(`  observed in 16d: Back/Continue 592-648 (shift ${711 - 592} pt) -> matches parent-relative, not the ${winBottom - kbTop} pt window overlap`);
show("C01 fix as written (map 0, status hidden, no offset)", pad({ frameY: 0, frameH: winBottom - bodyTop, kbTop }), winBottom - bodyTop);
show("C01 fix + keyboardVerticalOffset = body window y", pad({ frameY: 0, frameH: winBottom - bodyTop, kbTop, offset: bodyTop }), winBottom - bodyTop);
show("offset only, map still 46%", pad({ frameY: panelTop - bodyTop, frameH: winBottom - panelTop, kbTop, offset: bodyTop }), winBottom - panelTop);

console.log("\n== Phone landscape, iPhone 17 Pro 874x402 (estimate: insets top 0 / bottom 21; header ~63 + strip ~56; keyboard ~220 with predictive) ==");
{
  const bTop = 119, bBottom = 402 - 21, kb = 402 - 220; const fixed = 12 + 68 + 36 + 12; // acts, actions, links, panel paddingBottom
  const visible = kb - bTop;
  console.log(`side-by-side panel visible above keyboard with a CORRECT offset: ${visible} pt; fixed rows need ${fixed} pt -> ${visible >= fixed ? "fits" : "Continue/field still hidden unless header/strip/links hide too"}`);
  const p = pad({ frameY: 0, frameH: bBottom - bTop, kbTop: kb });
  console.log(`  without offset: padding ${p} (needs ${bBottom - kb})`);
}

console.log("\n== Tablet landscape, pilot hardware (estimate: body top ~140, bottom ~800 of 820; keyboard ~380) ==");
{
  const bTop = 140, bBottom = 800, kb = 820 - 380;
  const p = pad({ frameY: 0, frameH: bBottom - bTop, kbTop: kb });
  const contentBottom = bBottom - p;
  console.log(`iOS today / Android with behavior=padding: padding ${p} vs window overlap ${bBottom - kb}; content box ends ${contentBottom} vs keyboard top ${kb}: bottom ${contentBottom - kb} pt (footer rows ~128 pt incl. padding) behind keyboard`);
  const p2 = pad({ frameY: 0, frameH: bBottom - bTop, kbTop: kb, offset: bTop });
  console.log(`with keyboardVerticalOffset=${bTop}: padding ${p2}, content box ends ${bBottom - p2}`);
}
