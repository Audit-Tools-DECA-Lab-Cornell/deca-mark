# Reviewed contract decisions for implementation

The specification reviewer approved these additions on October 24, 2026. This records implementation decisions, not a claim of runtime acceptance. Preserve one engine/current served schema, with schema_version beside definition.

| Field | Shape and behavior |
| --- | --- |
| Form columnNaming | Optional literal `questionId`. New authored drafts set it and normalize ordinary/dynamic exportColumn to each question ID. Historical definitions without this marker retain existing observer-column omission. The marker is explicit provenance; never infer new behavior from label/source wording. |
| Question numberMode | Optional `integer` or `decimal`, default behavior integer. Decimal values and bounds are finite JSON numbers; no rounding or fractional-place restriction. Integer values/bounds retain safe-integer constraints. |
| Question valueSource | Optional `manual`, `accountId`, `observerCode`, or `captureTime`; absent means manual. accountId/observerCode allowed only on text; captureTime only on dateTime. Automatic questions are read-only in collection, with their source visible. |
| Question kind/dateTime | New kind `dateTime`. Its required dateTime object has mode `date`, `time`, or `dateTime`; dateFormat `iso`, `monthFirst`, `dayFirst` (default iso); timeFormat `12h`, `24h` (default24h); required valid IANA timeZone. Do not accept dateTime config on unrelated kinds. |
| Values | Date `YYYY-MM-DD`, years0001–9999 and real calendar date; time `HH:mm:ss`; combined UTC ISO timestamp ending Z. Date/time strings are canonical independent of display choice. Ambiguous manual local date+time must select an occurrence; nonexistent local time is refused. |

## Frozen capture context

Capture is first placement, using the existing observation startedAt flow. Persist the account ID, observer code and capture instant together outside the visibility-pruned answer map. Automatic questions revealed later derive from that context, even after restart or profile changes. Save the captured observer code in the existing envelope observer code; keep the existing observed_at/save timestamp behavior unless a separate explicit decision changes it. A capture-time answer is canonical and device-authored; the server cannot independently attest the instant at which a physical observation occurred.

The backend checks automatic accountId against the authenticated record owner and automatic observerCode against the immutable envelope observer code. It validates the shape/timezone semantics of captureTime, not an invented equality with the envelope's later save timestamp. Hidden answers retain the current pruning rules; missing capture context must not manufacture automatic values at upload time.

## Version transition

Target schema2; reuse existing FORM_SCHEMA_VERSION/parseServedDefinition exports. A transaction can leave known canonical definition JSON unchanged and update its schema_version/default only after every row validates as schema2 and preflight confirms that no formerly ignored numberMode, valueSource, dateTime, or columnNaming property would acquire new meaning. Never infer historical provenance from an unvalidated marker. Preflight **all** existing stored rows and abort on legacy/unknown formats instead of partially migrating. Use a table lock and narrowly disable/re-enable only the published-row trigger if necessary, preserving definitions, IDs, bound packages and answers. Do not remove the historical validator used by exact queued uploads/exports. New serving refusal must not block already-bound immutable replay. Do not create a template table.

Wire stored schema_version at form detail, historical observation detail, and mobile package/cache boundaries. Current-version writes are explicit. Never synthesize version2 for an unread database row or guess the version of an unknown cached layout.

Only prepare this migration as source. No migration application/reset is authorized for this run. Unsupported installed forms and retained drafts must remain stored with actionable refusal; known local layouts get a bounded forward conversion, never a null/dropped draft or changed queued body. Upgrade acceptance is required before enabling schema2 collection.

October 25 authorization addendum: the user subsequently approved the existing
local Supabase migration and requested production instructions. That local transition
passed with two canonical rows and unchanged application fingerprints apart from
version metadata. Hosted application remains a separate decision; use the
[production procedure](../../../database/hosted/form-schema2-rollout.md). No reset
or definition conversion was performed.
