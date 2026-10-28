import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { SIGNED_OUT_REPLY } from "@/lib/auth/signed-out-reply";
import { supabaseConfig } from "@/lib/supabase/config";

/**
 * Refreshes the Supabase sign-in on every matched request and keeps the workspace behind it: a signed-out
 * request for `/o/…` or `/account` goes to sign in and comes back afterwards (`next`). A signed-in person
 * who opens the home page goes straight to their workspace (`/o` picks the project). `/invite` and `/join`
 * are matched only so the sign-in cookie is refreshed there; they stay open to people who are signed out.
 * Without Supabase configured nobody is signed in, so the workspace stays closed.
 *
 * A Server Action POST from a signed-out browser is not redirected: it gets a fixed 401 (`SIGNED_OUT_REPLY`)
 * before the action runs. The action runner cannot follow a redirect to a page, and the 401 lets the page
 * that made the call say that the browser was signed out and nothing was changed (WEB-44).
 */
export async function proxy(request: NextRequest) {
	let response = NextResponse.next({ request });
	const config = supabaseConfig();
	const { pathname } = request.nextUrl;
	const protectedRoute = /^\/(o|account)(\/|$)/.test(pathname);
	let authenticated = false;
	if (config) {
		const supabase = createServerClient(config.url, config.key, {
			cookies: {
				getAll: () => request.cookies.getAll(),
				setAll(values) {
					values.forEach(({ name, value }) => request.cookies.set(name, value));
					response = NextResponse.next({ request });
					values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
				}
			}
		});
		const { data, error } = await supabase.auth.getClaims();
		authenticated = !error && Boolean(data?.claims.sub);
	}
	if (protectedRoute && !authenticated && request.method === "POST" && request.headers.has("next-action"))
		return signedOut();
	const destination =
		protectedRoute && !authenticated
			? signIn(request)
			: pathname === "/" && authenticated
				? workspace(request)
				: null;
	if (destination) {
		const redirected = NextResponse.redirect(destination);
		response.cookies.getAll().forEach(cookie => redirected.cookies.set(cookie));
		response = redirected;
	}
	// The public home page stays cacheable for people who are not signed in (and whose sign-in cookies
	// did not change); everything else is private.
	if (pathname === "/" && !destination && response.cookies.getAll().length === 0) return response;
	response.headers.set("Cache-Control", "private, no-store");
	response.headers.set("Referrer-Policy", "no-referrer");
	return response;
}

/** The answer to an action POST from a signed-out browser. Exactly `text/plain`: the action runner reads only that. */
function signedOut(): NextResponse {
	return new NextResponse(SIGNED_OUT_REPLY, {
		status: 401,
		headers: {
			"Content-Type": "text/plain",
			"Cache-Control": "private, no-store",
			"Referrer-Policy": "no-referrer"
		}
	});
}

function signIn(request: NextRequest): URL {
	const url = request.nextUrl.clone();
	url.pathname = "/sign-in";
	url.search = "";
	url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
	return url;
}

function workspace(request: NextRequest): URL {
	const url = request.nextUrl.clone();
	url.pathname = "/o";
	url.search = "";
	return url;
}

export const config = {
	matcher: [
		"/",
		"/o/:path*",
		"/account/:path*",
		"/sign-in",
		"/sign-up",
		"/verify",
		"/forgot-password",
		"/reset-password",
		"/invite",
		"/join"
	]
};
