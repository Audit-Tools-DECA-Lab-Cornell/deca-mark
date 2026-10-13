import { expect, it } from "vitest";
import development from "../../config/development.json";
import staging from "../../config/staging.json";
import { publicConfigSchema } from "./config-schema";

it("accepts local public anon and hosted publishable configurations", () => {
  const localAuth = new URL(publicConfigSchema.parse(development).supabaseUrl);
  expect(localAuth.protocol).toBe("http:");
  expect(localAuth.hostname).toBe("127.0.0.1");
  expect(Number(localAuth.port)).toBeGreaterThan(0);
  expect(publicConfigSchema.parse(staging).bundleIdSuffix).toBe(".dev");
  expect(publicConfigSchema.parse({ ...staging, powersyncUrl: undefined }).powersyncUrl).toBeNull();
});
it("rejects nonlocal HTTP and privileged JWT keys", () => {
  expect(
    publicConfigSchema.safeParse({ ...staging, apiUrl: "http://192.168.1.2:8000" }).success,
  ).toBe(false);
  const key = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role: "service_role" }))}.signature`;
  expect(publicConfigSchema.safeParse({ ...staging, publishableKey: key }).success).toBe(false);
  expect(
    publicConfigSchema.safeParse({ ...staging, publishableKey: "sb_secret_forbidden" }).success,
  ).toBe(false);
});
