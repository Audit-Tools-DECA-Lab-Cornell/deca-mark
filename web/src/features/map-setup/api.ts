"use client";
import { z } from "zod";

import { accessToken, browserApiUrl } from "@/lib/api/browser";
import { ApiError, parseApiError } from "@/lib/api/errors";

import { type Content, type Setup, setupEtag, setupSchema, setupSummarySchema } from "./schema";

export type Address = { readonly projectId: string; readonly siteId: string; readonly userId: string };
export async function request(address: Address, suffix: string, options: RequestInit = {}): Promise<unknown> {
	const base = browserApiUrl();
	if (!base) throw new ApiError("storage_unavailable", "retry");
	const token = await accessToken(address.userId);
	const response = await fetch(
		`${base}/v1/projects/${address.projectId}/sites/${address.siteId}/map-setups${suffix}`,
		{
			...options,
			cache: "no-store",
			signal: AbortSignal.timeout(180_000),
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers }
		}
	);
	const value: unknown = await response.json();
	if (!response.ok) throw parseApiError(response.status, value, response.headers);
	return value;
}
export async function loadSetup(address: Address, id?: string): Promise<Setup | null> {
	const value = await request(address, id ? `/${id}` : "");
	if (id) return setupSchema.parse(value);
	const active = z
		.array(setupSummarySchema)
		.parse(value)
		.find(item => item.state === "draft");
	if (!active) return null;
	return setupSchema.parse(await request(address, `/${active.setup_id}`));
}
export async function saveSetup(address: Address, setup: Setup, content: Content): Promise<Setup> {
	return setupSchema.parse(
		await request(address, `/${setup.setup_id}`, {
			method: "PUT",
			headers: { "If-Match": setupEtag(setup) },
			body: JSON.stringify(content)
		})
	);
}
