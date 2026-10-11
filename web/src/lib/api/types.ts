import type { components } from "./schema";

/**
 * Names for the API's schemas (`contracts/openapi.json`, generated into `schema.d.ts`). Types only, so
 * client screens can import them without pulling in the server-side client.
 */

type Schemas = components["schemas"];

export type Identity = Schemas["Identity"];
export type Profile = Schemas["Profile"];
export type Organization = Schemas["Organization"];
export type OrganizationMember = Schemas["OrganizationMember"];
export type OrganizationMembership = Schemas["OrganizationMembership"];
export type OrganizationPatch = Schemas["OrganizationPatch"];
export type Project = Schemas["Project"];
export type ProjectCreate = Schemas["ProjectCreate"];
export type ProjectPatch = Schemas["ProjectPatch"];
export type ProjectMember = Schemas["ProjectMember"];
export type ProjectMembership = Schemas["ProjectMembership"];
export type Invitation = Schemas["Invitation"];
export type InvitationCreated = Schemas["InvitationCreated"];
export type InvitationPreview = Schemas["InvitationPreview"];
export type InvitationRedeemed = Schemas["InvitationRedeemed"];
export type InvitationCredential = { token: string } | { code: string };
export type OrgInvitationCreate = Schemas["OrgInvitationCreate"];
export type ProjectInvitationCreate = Schemas["ProjectInvitationCreate"];
export type InvitationRole = Invitation["role"];
export type Site = Schemas["Site"];
export type SiteCreate = Schemas["SiteCreate"];
export type SitePatch = Schemas["SitePatch"];
export type SitePackageInfo = Schemas["SitePackageInfo"];
export type ManifestZone = Schemas["ManifestZone"];
export type Extent = Schemas["Extent"];
export type PackageSummary = Schemas["PackageSummary"];
export type PackageDetail = Schemas["PackageDetail"];
export type PackageSubmission = Schemas["PackageRequest"];
export type ProjectImportRequest = Schemas["ProjectImportRequest"];
export type ProjectImportResult = Schemas["ProjectImportResult"];
export type PreparationCheck = Schemas["PreparationCheck"];
export type FeatureCollection = Schemas["FeatureCollection"];
export type FormSummary = Schemas["FormSummary"];
export type FormVersionSummary = Schemas["FormVersionSummary"];
export type FormVersionDetail = Schemas["FormVersionDetail"];
export type FormCreate = Schemas["FormCreate"];
export type VersionState = Schemas["VersionState"];
/** A form definition as the API stores it: canonical `questions`, or legacy `fields`. */
export type RawDefinition = FormVersionDetail["definition"];
export type ObservationRow = Schemas["ObservationRow"];
export type StoredObservation = Schemas["StoredObservation"];
export type ErrorCode = Schemas["ErrorCode"];
