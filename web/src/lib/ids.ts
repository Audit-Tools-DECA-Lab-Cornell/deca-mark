/**
 * A new random identity (an RFC 4122 version 4 UUID), such as a drawn zone's `zone_id` or a request ID.
 *
 * `crypto.randomUUID` exists only in a secure context (HTTPS or localhost), so a tablet opening the web on a
 * LAN address over plain HTTP has none. `crypto.getRandomValues` works in every context, and the same 122
 * random bits make the same kind of identity.
 */
export function newId(): string {
	if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6]! & 0x0f) | 0x40;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
