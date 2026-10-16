# wp0a-data-layer report

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../../plan/current-state.md) and [web task owners](../../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.

## Summary
WP0A data layer is built and every required check passes.

- **Shared contract** in `lib/workspace/*`: types, access, result, home, invitations, plus `build.ts`, which holds the pure `buildWorkspaceIndex(me, claims)`.
- **Pure modules:** `lib/time.ts`, `lib/labels.ts`, `lib/download.ts`, `lib/observations/{answers,summary}.ts`, `lib/export/{columns,observations}.ts` and `lib/sites/archive.ts` (uses fflate).
- **Server-only reads and writes:**
  - `lib/api/client.ts`: cached `session()` and `apiClient()`, a new timeout signal for each request, and the `call`/`callEmpty` helpers. `getIdentity`, `updateProfile` and `deleteAccount` are kept.
  - `lib/api/workspace.ts`: every read is wrapped in `cache()` with string arguments only. Reads throw on failure; `getWorkspace` never throws.
  - `lib/api/mutations.ts`: one function per write endpoint.
- **Browser and types:** `lib/api/browser.ts` uploads and downloads packages directly from the browser, refreshing the sign-in if it expires within 60 s and checking the download against its SHA-256 ETag. `lib/api/types.ts` holds the type names.
- **`errors.ts`:** every existing code is kept. User-facing copy no longer says session, server or token. 410 reads as an expired invitation, 429 reads Retry-After ("Wait 42 seconds"), and 422 `details.fields` becomes a field → problem map on `ApiError.fields`.
- **Moved code:** `features/data/exportColumns.ts` now holds only a re-export of `lib/export/columns.ts`.

Backend contract rules are followed:
- `listObservations` sends only site, round_type, limit=500 and (when given) since, and returns `{rows, limited}`.
- `getObservation` uses the direct endpoint.
- Answers, labels, export and codebook all read the newer `questions` definitions and the old `fields` ones.
- Days are counted with Intl in the project timezone, and the clock-change days are tested.
- A missing round counts as Standard; a missing zone stays in a "No zone" bucket.

**Orgs reached only through a project:** I read the backend.
- `GET /v1/orgs` is limited by row security to the same orgs as `/v1/me` `organization_memberships`.
- Redeeming a project invitation always adds an org 'member' row, so Janet's observers resolve `/o/<slug>` normally.
- The only project-only membership in the data is the training project, which is hidden. As a fallback, a project whose org is not in the memberships still gets an org entry with its id as the web address and the name "Organization".

84 unit tests cover all the requested areas. The site-archive test zips the real Fall Creek layers the same way `scripts/bootstrap-study.mjs` sends them, and adds a synthetic package with a MultiPolygon zone.

## Files
/home/user/Field-Maps/web/src/lib/workspace/types.ts
/home/user/Field-Maps/web/src/lib/workspace/access.ts
/home/user/Field-Maps/web/src/lib/workspace/result.ts
/home/user/Field-Maps/web/src/lib/workspace/home.ts
/home/user/Field-Maps/web/src/lib/workspace/invitations.ts
/home/user/Field-Maps/web/src/lib/workspace/build.ts
/home/user/Field-Maps/web/src/lib/time.ts
/home/user/Field-Maps/web/src/lib/labels.ts
/home/user/Field-Maps/web/src/lib/download.ts
/home/user/Field-Maps/web/src/lib/observations/answers.ts
/home/user/Field-Maps/web/src/lib/observations/summary.ts
/home/user/Field-Maps/web/src/lib/export/columns.ts
/home/user/Field-Maps/web/src/lib/export/observations.ts
/home/user/Field-Maps/web/src/lib/sites/archive.ts
/home/user/Field-Maps/web/src/lib/api/client.ts
/home/user/Field-Maps/web/src/lib/api/workspace.ts
/home/user/Field-Maps/web/src/lib/api/mutations.ts
/home/user/Field-Maps/web/src/lib/api/browser.ts
/home/user/Field-Maps/web/src/lib/api/types.ts
/home/user/Field-Maps/web/src/lib/api/errors.ts
/home/user/Field-Maps/web/src/features/data/exportColumns.ts
/home/user/Field-Maps/web/tests/unit/support.mjs
/home/user/Field-Maps/web/tests/unit/access.test.mjs
/home/user/Field-Maps/web/tests/unit/home.test.mjs
/home/user/Field-Maps/web/tests/unit/workspace-index.test.mjs
/home/user/Field-Maps/web/tests/unit/invitations.test.mjs
/home/user/Field-Maps/web/tests/unit/time.test.mjs
/home/user/Field-Maps/web/tests/unit/labels.test.mjs
/home/user/Field-Maps/web/tests/unit/answers.test.mjs
/home/user/Field-Maps/web/tests/unit/summary.test.mjs
/home/user/Field-Maps/web/tests/unit/export.test.mjs
/home/user/Field-Maps/web/tests/unit/errors.test.mjs
/home/user/Field-Maps/web/tests/unit/site-archive.test.mjs
/home/user/Field-Maps/web/tests/data-export.test.mjs

## Checks
All run from /home/user/Field-Maps with the Node 24 / pnpm 10.17.1 PATH, after my last edit:
- `pnpm --dir web typecheck` (tsc --noEmit): no errors. This covers the whole web project as it stood at that moment, including other agents' files.
- `pnpm exec eslint <my 34 files>` (run in web/): exit 0, no problems.
- `pnpm exec prettier --check <my 34 files>`: "All matched files use Prettier code style!". Files were formatted with `prettier --write` on my files only; `eslint --fix` was run only on lib/api/{client,mutations,workspace}.ts to sort imports.
- `pnpm --dir web test:unit`: 84 tests, 84 pass, 0 fail.
- `pnpm --dir web test:api-errors` (existing test of errors.ts): 31 tests, 31 pass, 0 fail.
- `pnpm --dir web test:account` (profile-answer + the retargeted data-export test): 12 tests, 12 pass, 0 fail.

Not run: `next build`, test:auth, E2E, and anything against a live API.

## Open issues
- **Untested code:** the server-side reads and writes (lib/api/client.ts, workspace.ts, mutations.ts) and browser.ts are only typechecked. Nothing called a running API; that is left for the WP9 end-to-end tests on the local stack.
- **Test loading:** the unit tests load app modules through tests/unit/support.mjs, a resolve hook (`node:module` `registerHooks`, available in Node 22.15 / 23.5 and later). It maps `@/` and extensionless relative imports to the `.ts` files. Each test imports support.mjs first, then loads modules with `await load('lib/…')`. Static imports of TS modules that themselves import other modules at runtime would fail without it.
- **Request typing:** `call<T>` casts the response body to T. openapi-fetch turns the schema's pairs (coordinates, centre) into plain arrays, which would not typecheck against the schema types. Every call site has a declared return type, so the API response itself is not checked against T at compile time.
- **Fallback org name:** an org reached only through a project gets its id as the web address and the name "Organization". Real data should not produce this (see summary).
- **resolveOrg / resolveProject:** both throw an ApiError when the workspace is unavailable, and return null only when it is ready but has no match. WP0B layouts should check `getWorkspace()` status first and show LoadFailure, or let the error boundary catch it.
- **Contract additions:** `Failure` gained two optional fields, `fields` and `retryAfter`. `ProjectCreate` has no description field in the API schema even though the build spec mentions one, so `createProject` sends only {code, name, timezone}.
- **CSV columns:** the round columns are named `Rel_Round` and `First_Round` (values yes/no, empty for inventory), following the collector's `roundColumns` as the task asked rather than the lowercase names in the spec list.
- **CSV cells:** a missing answer is an empty cell and a null answer is `n/a`. `toCsv` adds a UTF-8 byte order mark only on request, via `{ byteOrderMark: true }`.

## Notes for screens
IMPORT RULES: server pages import reads from "@/lib/api/workspace" and writes (in "use server" actions) from "@/lib/api/mutations". Client components may import "@/lib/workspace/*", "@/lib/time", "@/lib/labels", "@/lib/observations/*", "@/lib/export/*", "@/lib/download", "@/lib/api/types" (types only), "@/lib/api/browser", and "@/lib/api/errors". They may also import "@/lib/sites/archive", which brings in zod and fflate.

== lib/workspace/types.ts ==
- OrgRole = "owner"|"admin"|"member"; ProjectRole = "manager"|"observer"|"viewer"; RoundType = "standard"|"reliability"|"inventory".
- Failure = {code: string; kind: "sign-in"|"retry"|"rejected"; message: string; fields?: Record<string,string> (422 field id → problem); retryAfter?: number (429 seconds)}.
- Result<T> = {ok:true; data:T} | {ok:false; failure:Failure}.
- AccountSummary = {userId: string|null; name: string; email?: string; initials: string}.
- OrgRef = {id, slug, name, role: OrgRole}.
- ProjectRef = {id, orgId, orgSlug, code, name, role: ProjectRole}.
- WorkspaceIndex = {status: "ready"|"unavailable"; failure?: Failure; account; orgs: OrgRef[]; projects: ProjectRef[]}.

== lib/workspace/access.ts ==
- projectAbilities(role: ProjectRole|null): {read, manage, collectOnly}. manager → read+manage; viewer → read; observer → collectOnly; null → none.
- orgAbilities(role: OrgRole|null): {manage, manageOwners, createProject}. owner → all; admin → manage+createProject.

== lib/workspace/result.ts ==
- settle<T>(p: Promise<T>): Promise<Result<T>>. Rethrows non-API errors, including Next redirect and notFound.
- toFailure(error: unknown): Failure (rethrows non-API errors).
- isNoAccess(f: Failure): boolean. True for role_required, membership_required, account_deleted.
- isNotFound(f: Failure): boolean.

== lib/workspace/home.ts ==
- homeFor(index: WorkspaceIndex, rememberedPath?: string): string|null. Order:
  1. Remembered path, if the person is still a member (observer → /o/<slug>/collect; unsafe paths ignored).
  2. Their only project (observer → collect).
  3. First org that has their projects, ranked owner, admin, member, then by name; an org where all their projects are observer projects → /o/<slug>/collect, otherwise /o/<slug>.
  4. Owner or admin of an org with no projects → /o/<slug>.
  5. Otherwise null. Unavailable index → null.
- projectPath(p: ProjectRef): string. Observer → collect.
- collectPath(orgSlug: string): string.

== lib/workspace/invitations.ts ==
- activeInvitations<T extends {revoked_at, expires_at, use_count, max_uses}>(list: T[], nowIso: string): T[].
- isActiveInvitation(inv, nowIso): boolean.
- inviteLink(origin: string, token: string): string → `${origin}/invite#t=<encoded token>`.
- usesLabel(inv): string → "2 of 25".

== lib/workspace/build.ts ==
- buildWorkspaceIndex(me: Identity, claims: {sub?, email?}|null): WorkspaceIndex.
- unavailableWorkspace(failure: Failure, claims): WorkspaceIndex.
- accountSummary(me|null, claims|null): AccountSummary.
- UNNAMED_ORGANIZATION = "Organization".

== lib/time.ts ==
- clock(timeZone: string): Clock. Unknown timezone falls back to UTC; `clock.timeZone` says which was used. Clock methods:
  - day(iso) → "Oct 07, 2026"; shortDay(iso) → "Oct 07"; time(iso) → "14:05".
  - dayTime(iso) → "Oct 07, 2026 · 14:05"; dayKey(iso) → "2026-10-07".
  - relativeDay(iso, nowIso) → "Today" | "Yesterday" | "Oct 07" | "Oct 07, 2025".
  - relativeDayTime(iso, nowIso) → "Today 14:05" | "Oct 07 · 14:05".
  - keyLabel(key) → "Oct 07, 2026"; shortKeyLabel(key) → "Oct 07".
  - An unreadable time formats as "".
- addDays(key, n), daysBetween(fromKey, toKey), dayKeysBetween(fromKey, toKey): string[].
- isTimeZone(v): boolean; timeZones(): string[] (for a picker); DEFAULT_TIME_ZONE = "America/New_York".

== lib/labels.ts ==
- shortLabel(id) → "OBS-3F2A1B".
- ROUND_TYPES: RoundType[].
- roundOf(t|null) → RoundType (null → standard).
- roundLabel(t|null) → "Standard round"; roundName(t|null) → "Standard".
- isRoundType(v).
- NO_ZONE = "No zone"; zoneName(zone|null, names?: Map<id,label>).
- plural(n, singular, pluralForm?) → "1,204 observations"; formatCount(n); formatBytes(bytes) → "13 KB" / "3.4 MB".

== lib/download.ts ==
- saveBlob(blob, fileName); saveText(text, fileName, mime). Browser event handlers only.
- packageFileName(siteCode, version) → "fall-creek-map-v3.zip".

== lib/observations/answers.ts ==
Definitions are passed raw (FormVersionDetail.definition); both `questions` and legacy `fields` work.
- readDefinition(def): FormModel {version, title, legacy, questions: FormQuestion[], protocolNotes: {id,title,detail}[]}.
- FormQuestion = {id, code, exportColumn, label, act: string|null, kind: "one"|"many"|"text"|"number"|"boolean", options: {code,label}[], dynamicFrom, dependsOn, required}.
- findQuestion(def, id); allOptions(q); questionLabel(def, id).
- playTypeQuestion(def): FormQuestion|undefined. The first single-choice question with act "Play".
- answerLabel(def, questionId, value, answers?): string. Option labels joined with ", "; "Yes"/"No"; numbers formatted en-US; missing → "Not answered".
- answerRows(def, answers): AnswerRow[] {questionId, label, value, raw, act, known}. Form order; hidden and unanswered skipped; unknown answers last with known=false.
- isAnswered(v); humanize(code); NOT_ANSWERED.

== lib/observations/summary.ts ==
Rows are ObservationRow or StoredObservation. Every count is Count<K> = {key: K; label: string; count: number}.
- countBy(rows, keyOf, labelOf?).
- byZone(rows, zones?: {id,label}[]): Count<string|null>[]. Site zones in order (zero counts kept), then historical zones, then "No zone".
- byRound(rows): Count<RoundType>[]. Always 3, legacy null → standard.
- byObserver(rows).
- byDay(rows, clock, {fill?}): by observed_at in the project timezone, oldest first.
- byQuestion(def, questionId, rows): Count<string|null>[]. Form options in order, then unknown values, then "Not answered".
- coverageMatrix(rows, zones?): {rows: {zone: string|null, label, known, counts: Record<RoundType,number>, total}[], totals, total, max}.
- fieldReturn(sites, rows, nowIso, clock): {total (sum of site observation_count), bySite, todayKey, today, last7Days, recentIsExact, lastReceivedAt, lastObservedAt}.
- activity({rows, packages?, forms?, sites?}, clock, {limit?: 20}): ActivityEntry[] {id, kind: "observations"|"package"|"form-published"|"form-draft"|"site", at, dayKey, title (a plain sentence), detail?, count?, observer?, siteCode?, formCode?, versionCode?, packageId?, state?}. Newest first.
- OBSERVATION_LIMIT = 500.

== lib/export/columns.ts ==
- RECORD_COLUMNS: {column, label, type}[]. Columns: observation_id, label, site_code, site_name, zone, round_type, Rel_Round, First_Round, placement, observer, observed_at, received_at, form_version, revision, longitude, latitude.
- RECORD_COLUMN_NAMES; answerHeader(qid, exportColumn?); repeatsRecordColumn(qid, exportColumn?); escapeCsv; csvLine.
- Legacy helpers: answerColumns, codebookFor.

== lib/export/observations.ts ==
- toCsv(rows, definitions: Record<versionCode, rawDefinition>, {byteOrderMark?}): string. CRLF line ends; missing answer → empty cell, null → "n/a"; multi-select codes joined with ";".
- toGeoJson(rows, definitions): string. Points are [lng, lat]; missing answers are left out, null stays null.
- codebook(definitions, rows?): string. CSV with columns export_column, source, label, type, values.
- exportColumns(rows, definitions): ExportColumn[].
- exportFileName(projectCode, "observations"|"codebook", dayKey, "csv"|"geojson").
- EMPTY_CELL_NOTE (one sentence for the export dialog); NULL_ANSWER.

== lib/sites/archive.ts ==
- readPackageArchive(bytes: Uint8Array): {manifest, layers}. Throws PackageArchiveError with a plain reason.
- packageSiteCollection(name, manifest, layers): SiteCollection.
- packagePlan(name, bytes): ProjectedSite.
- Upload preview for WP1, which can replace features/packages/upload-preview.ts: layersPlan(name, {ground?, paths?, trees?, zones?}): ProjectedSite|null; zonesFromLayer(zonesLayer): ManifestZone[] (derived the way the API derives them).
- Zones in a plan:
  - PlanZone.id is the zone id the records hold ("A"), and PlanZone.code is that same id. To link counts, use `zone.code ?? zone.id`.
  - A MultiPolygon zone's extra parts have ids like "A~2".

== lib/api/errors.ts ==
- ApiError {code, kind, message, status?, retryAfter?, fields: Record<string,string>, detail? (server message, validation_failed only)}.
- errorCopy; parseApiError(status, body, headers?); readApiError(res); apiRequestError(e).
- fieldProblems(details); retryAfterSeconds(v); waitCopy(s); UNKNOWN_ERROR_COPY.
- Copy: 409 conflict → "Someone else changed this at the same time. Reload the page to see the latest, then try again."; 410 → "This invitation has expired. Ask your project manager for a new one."; 429 → "Too many tries. Wait N seconds and try again."

== lib/api/client.ts (server-only) ==
- session(): Promise<ApiSession>, cached.
- apiClient(), cached.
- call<T>(api => api.GET(...)): Promise<T>; callEmpty(fn): Promise<void>.
- getIdentity(), updateProfile(patch), deleteAccount().

== lib/api/workspace.ts (server-only; reads are cached with string args) ==
Reads throw ApiError; wrap them with settle().
- Workspace:
  - getMe(): Identity.
  - getWorkspace(): WorkspaceIndex. Never throws.
  - resolveOrg(slug): OrgRef|null. Throws if the workspace is unavailable.
  - resolveProject(orgSlug, code): ProjectRef|null. Throws if the workspace is unavailable.
- Organizations:
  - getOrganization(orgId): Organization. Owner/admin only.
  - listOrgProjects(orgId): Project[].
  - listOrgMembers(orgId): OrganizationMember[]. Owner/admin only.
  - listOrgInvitations(orgId): Invitation[]. Owner/admin only.
- Projects:
  - getProject(projectId): Project.
  - listProjectMembers(projectId) and listProjectInvitations(projectId). Managers only.
- Sites and packages:
  - listSites(projectId): Site[]; getSite(projectId, code): Site.
  - listPackages(projectId, siteCode?): PackageSummary[]; getPackage(projectId, packageId): PackageDetail.
  - getPackageArchive(projectId, packageId): Uint8Array.
  - getSitePlan(projectId, packageId, siteName): ProjectedSite|null. null when the archive cannot be drawn.
- Forms:
  - listForms(projectId): FormSummary[]; getFormVersion(projectId, code): FormVersionDetail.
  - getFormDefinitions(projectId, codes: string[]): {definitions: Record<code, RawDefinition>, missing: string[]}. Not cached itself, but each version read is.
- Observations:
  - listObservations(projectId, site?, roundType?, since?): {rows: ObservationRow[]; limited: boolean}. limited means 500 rows came back.
  - getObservation(projectId, id): StoredObservation.
- OBSERVATION_LIMIT.

== lib/api/mutations.ts (server-only; each throws ApiError) ==
- Organizations:
  - createProject(orgId, {code, name, timezone}): Project.
  - patchOrganization(orgId, {name?, slug?}): Organization.
  - transferOwnership(orgId, userId): void.
  - setOrgRole(orgId, userId, role: OrgRole): void; removeOrgMember(orgId, userId): void.
  - createOrgInvitation(orgId, {role: "member"|"admin", email?, max_uses, expires_in_days}): InvitationCreated.
  - revokeOrgInvitation(orgId, invitationId): void.
- Projects:
  - patchProject(projectId, {name?, description?, timezone?, status?}): Project.
  - setProjectRole(projectId, userId, role: ProjectRole): void; removeProjectMember(projectId, userId): void.
  - createProjectInvitation(projectId, {role, email?, max_uses, expires_in_days}): InvitationCreated.
  - revokeProjectInvitation(projectId, invitationId): void.
- Sites:
  - createSite(projectId, {code, name, description?}): Site.
  - patchSite(projectId, code, {name?, description?}): Site.
- Forms:
  - createForm(projectId, {code, name, definition}): FormVersionDetail (the first draft).
  - createDraft(projectId, formCode, definition?): FormVersionDetail. Without a definition it sends {} and the API copies the newest version.
  - saveDraft(projectId, versionCode, definition): FormVersionDetail.
  - discardDraft(projectId, versionCode): void.
  - publishVersion(projectId, versionCode) and retireVersion(projectId, versionCode): FormVersionDetail.
- Invitations:
  - previewInvitation({token}|{code}): InvitationPreview.
  - redeemInvitation({token}|{code}): InvitationRedeemed.

== lib/api/browser.ts ("use client") ==
- browserApiUrl(): string|null.
- browserApi(timeoutMs?).
- preparePackage(projectId, submission: PackageSubmission): Promise<PackageDetail>. A blocked package is returned, not thrown.
- downloadPackageArchive(projectId, packageId, fileName): Promise<{bytes}>. Name the file with packageFileName(siteCode, version).

== lib/api/types.ts (types only) ==
Identity, Profile, Organization, OrganizationMember, OrganizationMembership, OrganizationPatch, Project, ProjectCreate, ProjectPatch, ProjectMember, ProjectMembership, Invitation, InvitationCreated, InvitationPreview, InvitationRedeemed, InvitationCredential, OrgInvitationCreate, ProjectInvitationCreate, InvitationRole, Site, SiteCreate, SitePatch, SitePackageInfo, ManifestZone, Extent, PackageSummary, PackageDetail, PackageSubmission, PreparationCheck, FeatureCollection, FormSummary, FormVersionSummary, FormVersionDetail, FormCreate, VersionState, RawDefinition, ObservationRow, StoredObservation, ErrorCode.

== Unit tests ==
Under node strip-types, write `import { load } from "./support.mjs"` and then `const m = await load("lib/…")`.
