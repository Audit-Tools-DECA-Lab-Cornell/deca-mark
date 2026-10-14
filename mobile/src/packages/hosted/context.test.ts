import { afterEach, expect, it } from "vitest";
import { forgetVerifiedPackage, rememberVerifiedPackage, setPackageAccessOwner } from "./access";
import { boundFixture, ids } from "./bound-fixture";
import { isStored } from "./context";
import { packageIdentity } from "./installation";
import { preparePackage } from "./prepare";

afterEach(() => setPackageAccessOwner(null));

it("keeps a site downloaded when a newer map is published or the current pointer is empty", async () => {
  const fixture = boundFixture();
  const stored = await preparePackage(ids.project, fixture.site, fixture.source);
  setPackageAccessOwner("account-a");
  expect(isStored(fixture.site)).toBe(false);
  rememberVerifiedPackage(
    "account-a",
    stored,
    packageIdentity("https://auth.example.test", stored),
  );
  const newer = {
    ...fixture.site,
    current_package_id: ids.form,
    package: { ...fixture.site.package, package_id: ids.form, package_version: 8 },
  };
  expect(isStored(newer)).toBe(true);
  expect(isStored({ ...fixture.site, current_package_id: null, package: null })).toBe(true);
  expect(isStored({ ...newer, site_id: ids.zone })).toBe(false);
  forgetVerifiedPackage("account-a", stored.packageId);
  expect(isStored(newer)).toBe(false);
});

it("counts only the current account's verified installs", async () => {
  const fixture = boundFixture();
  const stored = await preparePackage(ids.project, fixture.site, fixture.source);
  const identity = packageIdentity("https://auth.example.test", stored);
  setPackageAccessOwner("account-a");
  rememberVerifiedPackage("account-a", stored, identity);
  expect(isStored(fixture.site)).toBe(true);
  setPackageAccessOwner("account-b");
  expect(isStored(fixture.site)).toBe(false);
  rememberVerifiedPackage("account-a", stored, identity);
  expect(isStored(fixture.site)).toBe(false);
  setPackageAccessOwner(null);
  expect(isStored(fixture.site)).toBe(false);
});
