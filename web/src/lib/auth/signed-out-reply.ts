/**
 * What the proxy answers a Server Action POST with when the browser is signed out (`proxy.ts`): a fixed
 * 401 with this text, instead of the redirect to the sign-in page that a page request gets. A redirect
 * would send the action's POST to the sign-in page, which answers with a page the action runner cannot
 * read, so the call could only say it failed. The text lets the page that made the call tell a signed-out
 * browser from a dropped connection (`lib/action-rejection.ts`). The proxy stops the request before the
 * action runs, so nothing was changed.
 *
 * Kept free of imports so both the proxy and client components can read it.
 */
export const SIGNED_OUT_REPLY = "Signed out";
