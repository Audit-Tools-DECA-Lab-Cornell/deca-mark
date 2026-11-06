import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";

import { load } from "./support.mjs";

/*
 * WEB-50. The loading Suspense sits in the project and organization layouts and stays mounted across a
 * navigation, so the page on screen stays put until the next one is ready (React keeps an already-revealed
 * boundary instead of showing its fallback again, inside a transition). A link then needs its own sign that
 * the click worked, or on a slow response (the hosted API) nothing moves. That sign is LinkPending, inside
 * the Link, driven by next/link's useLinkStatus.
 *
 * These tests render the real components. Only next/link and next/navigation are replaced: the Link stub
 * gives its children a status the way Next does (pending for the link whose address is "pending"), so a test
 * can say which link is on its way and then that it has arrived.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LINK_STUB = `
import React from "react";
const Status = React.createContext({ pending: false });
const listeners = new Set();
let pendingHref = null;
export function setPendingHref(href) {
	pendingHref = href;
	for (const listener of [...listeners]) listener();
}
const subscribe = listener => (listeners.add(listener), () => listeners.delete(listener));
export function useLinkStatus() {
	return React.useContext(Status);
}
export default function Link({ href, prefetch, children, ...rest }) {
	const current = React.useSyncExternalStore(subscribe, () => pendingHref, () => pendingHref);
	return React.createElement(
		"a",
		{ href, ...rest },
		React.createElement(Status.Provider, { value: { pending: current === href } }, children)
	);
}
`;
const stubs = {
	"next/link": [new URL("stub-next-link.mjs", import.meta.url).href, LINK_STUB],
	"next/navigation": [
		new URL("stub-next-navigation.mjs", import.meta.url).href,
		'export const usePathname = () => "/o/acme/p/river";'
	]
};
const stubSources = new Map(Object.values(stubs));
registerHooks({
	resolve(specifier, context, next) {
		if (stubs[specifier]) return { url: stubs[specifier][0], shortCircuit: true };
		return next(specifier, context);
	},
	load(url, context, next) {
		if (stubSources.has(url)) return { format: "module", shortCircuit: true, source: stubSources.get(url) };
		if (url.endsWith(".tsx"))
			return {
				format: "module",
				shortCircuit: true,
				source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
					compilerOptions: {
						module: ts.ModuleKind.ESNext,
						jsx: ts.JsxEmit.ReactJSX,
						target: ts.ScriptTarget.ESNext
					}
				}).outputText
			};
		return next(url, context);
	}
});

const { setPendingHref } = await import("next/link");

const h = React.createElement;
const render = element => {
	let tree;
	act(() => {
		tree = create(element);
	});
	return tree;
};
/** Says which link is on its way (an address), or that none is (null). */
const navigating = href => act(() => setPendingHref(href));
const text = node =>
	typeof node === "string"
		? node
		: Array.isArray(node)
			? node.map(text).join("")
			: (node?.children ?? []).map(text).join("");
const links = tree => tree.root.findAllByType("a");
const linkAt = (tree, href) => {
	const found = links(tree).filter(link => link.props.href === href);
	assert.equal(found.length, 1, `one link to ${href}`);
	return found[0];
};
/** The still bar a pending link draws: decorative, so hidden from assistive technology. */
const barsIn = link =>
	link.findAll(node => typeof node.type === "string" && node.type === "span" && node.props["aria-hidden"] === "true");
/** What a screen reader reads in the link: its words, without anything marked aria-hidden. */
const accessibleText = link =>
	link
		.findAll(node => typeof node.type === "string" && !(node.props["aria-hidden"] === "true"))
		.flatMap(node => node.children.filter(child => typeof child === "string"))
		.join("");

function assertQuiet(link, what) {
	assert.equal(barsIn(link).length, 0, `${what}: no bar while idle`);
	assert.doesNotMatch(accessibleText(link), /loading/, `${what}: no loading words while idle`);
}

function assertPending(link, what) {
	const bars = barsIn(link);
	assert.equal(bars.length, 1, `${what}: one bar while its page is on its way`);
	assert.match(accessibleText(link), /, loading…/, `${what}: says it is loading`);
	const { className } = bars[0].props;
	// It shows after the skeleton delay, so a fast load shows nothing; it takes no room, so nothing shifts;
	// it never moves (DESIGN §7), so it is a bar that fades in and does nothing else.
	assert.match(
		className,
		/\[animation-delay:var\(--ct-duration-skeleton-delay\)\]/,
		`${what}: waits for the skeleton delay`
	);
	assert.match(className, /\babsolute\b/, `${what}: takes no room`);
	assert.match(className, /pointer-events-none/, `${what}: leaves the click to the link`);
	assert.match(className, /animate-fade-in/, `${what}: fades in`);
	assert.doesNotMatch(className, /animate-(?:pulse|spin|bounce|ping)/, `${what}: does not move`);
}

/** The behaviour every link that navigates between pages shares. */
function assertShowsPending(name, element, href) {
	test(`${name}: shows the pending mark while its page is on its way, and clears it on arrival`, () => {
		navigating(null);
		const tree = render(element);
		assertQuiet(linkAt(tree, href), name);
		navigating(href);
		assertPending(linkAt(tree, href), name);
		navigating(null);
		assertQuiet(linkAt(tree, href), name);
		tree.unmount();
	});
}

const base = "/o/acme/p/river";

test("the tab bar marks only the tab whose page is on its way", async () => {
	const { InkTabs } = await load("components/contour/InkTabs.tsx");
	const items = [
		{ href: base, label: "Overview" },
		{ href: `${base}/data`, label: "Data" },
		{ href: `${base}/sites`, label: "Sites" },
		{ href: `${base}/forms`, label: "Forms" }
	];
	navigating(null);
	const tree = render(h(InkTabs, { items, label: "Project" }));
	for (const item of items) assertQuiet(linkAt(tree, item.href), `${item.label} tab`);
	for (const item of items) {
		navigating(item.href);
		for (const other of items)
			if (other.href === item.href) assertPending(linkAt(tree, other.href), `${other.label} tab`);
			else assertQuiet(linkAt(tree, other.href), `${other.label} tab while ${item.label} loads`);
		navigating(null);
		for (const other of items) assertQuiet(linkAt(tree, other.href), `${other.label} tab once it has arrived`);
	}
	tree.unmount();
});

test("the tab bar keeps a tab's badge words beside its pending words", async () => {
	const { InkTabs } = await load("components/contour/InkTabs.tsx");
	const items = [
		{ href: base, label: "Overview" },
		{ href: `${base}/data`, label: "Data", badge: 3 }
	];
	navigating(`${base}/data`);
	const tree = render(h(InkTabs, { items, label: "Project" }));
	const words = accessibleText(linkAt(tree, `${base}/data`));
	assert.match(words, /Data/);
	assert.match(words, /, loading…/);
	assert.match(words, /3 need attention/);
	navigating(null);
	tree.unmount();
});

test("LinkPending draws nothing until its link is on its way", async () => {
	const { default: Link } = await import("next/link");
	const { LinkPending } = await load("components/contour/LinkPending.tsx");
	navigating(null);
	const tree = render(h(Link, { href: "/x" }, "Open", h(LinkPending)));
	assert.equal(barsIn(linkAt(tree, "/x")).length, 0);
	assert.equal(text(tree.toJSON()), "Open");
	navigating("/x");
	assert.equal(barsIn(linkAt(tree, "/x")).length, 1);
	assert.equal(text(tree.toJSON()), "Open, loading…");
	navigating(null);
	assert.equal(text(tree.toJSON()), "Open");
	tree.unmount();
});

test("LinkPending takes the placement of the link it sits in", async () => {
	const { default: Link } = await import("next/link");
	const { LinkPending } = await load("components/contour/LinkPending.tsx");
	navigating("/x");
	const tree = render(h(Link, { href: "/x" }, "Open", h(LinkPending, { className: "inset-x-5 bottom-1.5" })));
	const { className } = barsIn(linkAt(tree, "/x"))[0].props;
	assert.match(className, /inset-x-5 bottom-1\.5/);
	navigating(null);
	tree.unmount();
});

test("only the link on its way is marked when several lead to different pages", async () => {
	const { TextLink } = await load("components/contour/TextLink.tsx");
	navigating(null);
	const tree = render(
		h(
			"p",
			null,
			h(TextLink, { href: `${base}/data` }, "All observations"),
			h(TextLink, { href: `${base}/sites` }, "Open sites")
		)
	);
	navigating(`${base}/data`);
	assertPending(linkAt(tree, `${base}/data`), "All observations");
	assertQuiet(linkAt(tree, `${base}/sites`), "Open sites");
	// A second click elsewhere: the first has arrived or been replaced, and only the new one is marked.
	navigating(`${base}/sites`);
	assertQuiet(linkAt(tree, `${base}/data`), "All observations");
	assertPending(linkAt(tree, `${base}/sites`), "Open sites");
	navigating(null);
	tree.unmount();
});

// The links that take a person from one page of a project or organization to another. The tab bar is not
// the only way: Overview's "All observations" is a TextLink, its "Review observations" a ButtonLink.
{
	const { TextLink } = await load("components/contour/TextLink.tsx");
	const { ButtonLink } = await load("components/contour/Button.tsx");
	const { Breadcrumbs } = await load("components/contour/Breadcrumbs.tsx");
	assertShowsPending(
		"TextLink (accent, with its arrow)",
		h(TextLink, { href: `${base}/data` }, "All observations"),
		`${base}/data`
	);
	assertShowsPending(
		"TextLink (ink, no glyph)",
		h(TextLink, { href: `${base}/sites`, tone: "ink" }, "Sites"),
		`${base}/sites`
	);
	assertShowsPending(
		"TextLink (glyph before the words)",
		h(TextLink, { href: `${base}/forms`, icon: "pencil", arrow: false }, "Edit forms"),
		`${base}/forms`
	);
	assertShowsPending(
		"ButtonLink (primary)",
		h(ButtonLink, { href: `${base}/data`, variant: "primary", iconRight: "arrow-right" }, "Review observations"),
		`${base}/data`
	);
	assertShowsPending(
		"ButtonLink (outline, leading glyph)",
		h(ButtonLink, { href: base, variant: "outline", icon: "arrow-left" }, "Back to the project"),
		base
	);
	assertShowsPending(
		"Breadcrumbs (an ancestor)",
		h(Breadcrumbs, {
			items: [
				{ label: "River study", href: base },
				{ label: "Data", href: `${base}/data` },
				{ label: "Observation 12" }
			]
		}),
		`${base}/data`
	);
}

test("the current page of a breadcrumb trail is text, not a link, and shows no mark", async () => {
	const { Breadcrumbs } = await load("components/contour/Breadcrumbs.tsx");
	navigating(null);
	const tree = render(h(Breadcrumbs, { items: [{ label: "River study", href: base }, { label: "Observation 12" }] }));
	assert.equal(links(tree).length, 1);
	navigating(base);
	assert.equal(barsIn(tree.root).length, 1);
	assert.match(text(tree.toJSON()), /Observation 12/);
	navigating(null);
	tree.unmount();
});
