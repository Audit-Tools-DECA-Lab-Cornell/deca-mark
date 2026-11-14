# Variable library contracts

The [wire contract](../../docs/plan/library/contract.md) owns scope, UUID identity,
usage counting, ETags, bodies and error semantics. `backend/src/fieldmaps_api/library_schemas.py`
contains bounded wire types. Read routes expose their models through generated OpenAPI;
there are no placeholder routes for later writes/templates.

`reference.cases.json` has hand-authored scope, closure, order, collision and copy
expectations for future picker/write implementations. Its short IDs are symbolic case
identities, not UUID wire examples. CON-08 checks case integrity and model boundaries;
algorithm conformance belongs to the implementation of those algorithms. No source-tag
acceptance or form-schema change is introduced here.

The four library write error literals and blocker models are defined beside these DTOs.
They are not emitted/added to the current shared error-code union until the write routes
land (BE-29). This keeps the existing CON-04 clients unchanged and code-based; this slice
emits only existing read/auth/storage errors.
