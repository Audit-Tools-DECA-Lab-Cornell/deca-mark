import { rmSync } from "node:fs";
import { expect, it } from "vitest";
import { z } from "zod";
import { createApiClient } from "../../data/api/client";
import { buildObservation } from "../../domain/build-observation";
import type { RoundType } from "../../domain/rounds";
import type { Answers, FormDefinition } from "../../forms/definition";
import { reviewProblems } from "../../forms/engine";
import { sessionBinding } from "../../session/bound-context";
import { formForRound } from "../../session/round-forms";
import { saveObservation } from "../../storage/observation-store";
import { installedFor } from "../../storage/package-store.fixture";
import { pendingObservations } from "../../storage/sync-store";
import { createBoundUpload } from "../../sync/bound-upload";
import { scopeKey, syncScopeSchema } from "../../sync/contracts";
import { createSyncCoordinator } from "../../sync/coordinator";
import { openSitePackage } from "../open";
import { readStoredPackage, setPackageAccessOwner } from "./access";
import { hostedSitePackage } from "./build";
import { harness, hash } from "./lifecycle.test-helper";
import { storedForms } from "./prepare";

/**
 * MOB-43 against the real API: a fresh account that has only signed in joins Training, downloads the
 * seeded Practice garden with its forms (read by `parseServedDefinition` at the schema version the API
 * serves), collects in a Standard, a Reliability and an Inventory round, and uploads all three to the
 * Training project. Driven by `mobile/scripts/training-api-acceptance.py`, which starts the loopback API
 * against the local stack and passes the account in `MOB43_TRAINING_API_FIXTURE`.
 */

const input = process.env["MOB43_TRAINING_API_FIXTURE"];

/** Answers every question the form requires, from the form's own options, ranges and kinds. */
function answerRequired(form: FormDefinition): Answers {
  const answers: Record<string, string | number | string[]> = {};
  for (let pass = 0; pass < 10; pass += 1) {
    const problems = reviewProblems(form, answers);
    if (problems.length === 0) return answers;
    for (const { question } of problems) {
      if (question.kind === "one") answers[question.id] = question.options[0]?.code ?? "";
      else if (question.kind === "many") answers[question.id] = [question.options[0]?.code ?? ""];
      else if (question.kind === "number") answers[question.id] = question.min ?? 0;
      else answers[question.id] = "Synthetic MOB-43 acceptance".slice(0, question.maxLength ?? 99);
    }
  }
  throw new Error(`Could not answer ${form.version}`);
}

it.skipIf(!input)(
  "a fresh account joins Training, downloads Practice garden, collects three rounds and uploads them to Training",
  async () => {
    const fixture = z
      .object({ scope: syncScopeSchema, token: z.string() })
      .parse(JSON.parse(input ?? "null"));
    const { scope, token } = fixture;
    if (!scope.apiUrl.startsWith("http://127.0.0.1:"))
      throw new Error("Disposable loopback API required");
    const owner = scopeKey(scope);
    const api = createApiClient(scope.apiUrl, async () => token);
    setPackageAccessOwner(owner);
    const h = await harness({
      owner,
      issuer: scope.issuer,
      api,
      authorizedProject: (project) => project === scope.projectId,
      source: (client, project, signal) => ({
        archive: async (id) => {
          const request = await client.archiveRequest(project, id);
          const response = await fetch(request.url, { headers: request.headers, signal });
          if (!response.ok) throw new Error(`Archive HTTP ${response.status}`);
          return new Uint8Array(await response.arrayBuffer());
        },
        sha256: hash,
        formVersion: (code) => client.formVersion(project, code, signal),
      }),
    });
    try {
      // The account's membership lists Training, and Training lists the one site it was seeded with.
      const me = await api.me(new AbortController().signal);
      expect(me.project_memberships).toMatchObject([
        { project_id: scope.projectId, is_training: true, role: "observer" },
      ]);
      const sites = await h.operations.refresh(scope.projectId, []);
      expect(sites).toMatchObject([{ code: "training-garden", name: "Practice garden" }]);
      const [site] = sites ?? [];
      if (!site) throw new Error("Practice garden missing");

      // The install verifies the package and reads both forms at the served schema version.
      expect(await h.operations.download(scope.projectId, site, () => {})).toBe(true);
      const stored = readStoredPackage(site.package?.package_id ?? "");
      const selected = await installedFor(h.database, owner, scope.projectId, site.site_id);
      if (!stored || !selected) throw new Error("Installed Practice garden missing");
      expect(stored.formSchemaVersions).toEqual({ play: 2, inventory: 2 });
      const forms = storedForms(stored);
      expect([forms.play.version, forms.inventory?.version]).toEqual([
        stored.manifest.forms.play.form_version,
        stored.manifest.forms.inventory?.form_version,
      ]);
      expect(stored.manifest.forms.play.form_version).toBe("training-v1");
      expect(stored.manifest.forms.inventory?.form_version).toBe("training-inventory-v1");

      // The session opens it like any hosted site, and offers all three rounds from the package's forms.
      const sitePackage = hostedSitePackage(stored, forms, selected.identity);
      expect(sitePackage.projectId).toBe(scope.projectId);
      expect(await openSitePackage(sitePackage.id)).toMatchObject({ id: sitePackage.id });
      const zone = sitePackage.zones[0];
      if (!zone) throw new Error("Practice garden has no zone");
      const binding = sessionBinding(sitePackage, zone);
      const made = [];
      for (const round of ["standard", "reliability", "inventory"] as const satisfies RoundType[]) {
        const form = formForRound(sitePackage, round);
        if (!form) throw new Error(`No form for the ${round} round`);
        const built = buildObservation({
          id: crypto.randomUUID(),
          form,
          answers: answerRequired(form),
          coordinates: zone.displayAnchor,
          placement: { source: round === "inventory" ? "zone" : "hand", gpsAccuracyMetres: null },
          context: {
            packageId: binding.packageId,
            packageVersion: `v${binding.packageVersion}`,
            zoneId: zone.id,
            zoneLabel: zone.label,
            roundType: round,
            freshPeriod: true,
            inheritedFrom: "",
          },
          siteId: sitePackage.siteId,
          projectId: scope.projectId,
          observer: "QA",
          createdAt: new Date().toISOString(),
          startedAt: new Date(Date.now() - 60_000).toISOString(),
          binding,
        });
        if (!built.ok) throw new Error(built.message);
        expect(built.record.storageStatus).toBe("pending");
        await saveObservation(h.database, built.record, owner);
        made.push(built.record);
      }
      expect(await pendingObservations(h.database, owner, Date.now())).toHaveLength(3);

      // All three upload to the Training project and are read back there.
      const drain = createSyncCoordinator({
        database: h.database,
        scope,
        getToken: async () => token,
        isCurrent: () => true,
        upload: createBoundUpload(scope.apiUrl, scope),
      });
      await drain(new AbortController().signal);
      expect(
        h.sqlite
          .prepare("SELECT COUNT(*) AS count FROM observations WHERE sync_state = 'synced'")
          .get()?.["count"],
      ).toBe(3);
      for (const record of made) {
        const response = await fetch(
          `${scope.apiUrl}/v1/projects/${scope.projectId}/observations/${record.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        expect(response.status).toBe(200);
        const read = z
          .object({
            package_id: z.uuid(),
            zone_id: z.uuid(),
            form_version: z.string(),
            geometry: z.unknown(),
          })
          .parse(await response.json());
        expect(read.package_id).toBe(binding.packageId);
        expect(read.zone_id).toBe(binding.zoneId);
        expect(read.form_version).toBe(record.formVersion);
        if (record.context.roundType === "inventory") expect(read.geometry).toBeNull();
      }
    } finally {
      h.operations.dispose();
      setPackageAccessOwner(null);
      h.sqlite.close();
      rmSync(h.root, { recursive: true, force: true });
    }
  },
  90000,
);
