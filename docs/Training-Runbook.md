# Training project operations

Training is a separate platform project. The original practice project and its observations stay unchanged. Migration application to hosted environments belongs to OPS-14 and OPS-17; this guide does not authorize a deployment.

| Resource | Fixed ID |
| --- | --- |
| Organization | `10000000-0000-4000-8000-000000000101` |
| Project | `10000000-0000-4000-8000-000000000102` |
| Site (`training-garden`, named "Practice garden") | `10000000-0000-4000-8000-000000000103` |
| Play form version (`training-v1`) | `10000000-0000-4000-8000-000000000104` |
| Inventory form version (`training-inventory-v1`) | `10000000-0000-4000-8000-000000000105` |
| Package v1 (current for the site) | `10000000-0000-4000-8000-000000000106` |
| Zones A "Lawn bed" and B "Sand bed" | `10000000-0000-4000-8000-000000000107`, `…0108` |

The migration `20261028090000_training_seed_and_form_templates.sql` (DB-20) seeds all of this; see the
[database README](../database/README.md#training-and-form-templates).

## Retention and privacy

Calling `fieldmaps_private.ensure_profile` enrolls an active account as an observer. Trainees can read only their own Training observations, even if temporarily granted the project manager role. Training does not expose other trainees' profiles or memberships, and the GIS practice view does not expose Training observations.

The `fieldmaps_training_purge` pg_cron job deletes observations received more than 30 days ago in the fixed Training project only. It does not use the `is_training` flag to select projects. The retention window remains subject to the research policy decision Q2 in [the decision log](plan/decisions.md).

After an explicitly approved hosted migration, verify the scheduled job as the database owner:

```sql
SELECT jobname, schedule, active, command
FROM cron.job WHERE jobname = 'fieldmaps_training_purge';
```

No user receives membership in the platform organization. Do not grant an organization owner or administrator role to manage Training.

## The Training site package

The Practice garden's package is seeded with the database, so no upload is needed for a fresh or rebuilt
database, and an account that signs in joins Training and downloads it like any site. To publish a newer
Training map, use the ordinary zone publication workflow (BE-22) with a temporary **project** manager account:

1. Select the intended environment explicitly. Use an operator account that already has an Auth user and profile. Record its user ID in the operation log.
2. As the database owner, give that account temporary **project** manager access. In `psql`, supply its ID at the prompt:

   ```sql
   \prompt 'Operator Auth user ID: ' training_operator_id
   INSERT INTO fieldmaps.project_memberships
     (user_id, organization_id, project_id, role)
   VALUES (:'training_operator_id'::uuid,
     '10000000-0000-4000-8000-000000000101',
     '10000000-0000-4000-8000-000000000102', 'manager')
   ON CONFLICT (user_id, project_id) DO UPDATE SET role = 'manager';
   ```

3. Sign in as that operator and publish the next package through the API. Record its version and validation result.
4. Remove the temporary manager membership even if publication fails:

   ```sql
   DELETE FROM fieldmaps.project_memberships
   WHERE project_id = '10000000-0000-4000-8000-000000000102'
     AND user_id = :'training_operator_id'::uuid AND role = 'manager';
   ```

   The next profile initialization restores ordinary observer membership.

5. Confirm there are no remaining manager memberships on Training and no platform organization memberships. Record cleanup in the operation log.
