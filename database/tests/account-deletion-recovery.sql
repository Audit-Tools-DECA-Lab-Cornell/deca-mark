-- Runs inside run.sql's rolled-back transaction; never invokes an Auth provider.
INSERT INTO auth.users(id) VALUES ('49000000-0000-4000-8000-000000000001');
INSERT INTO fieldmaps.profiles(user_id,display_name,observer_initials,locale)
VALUES ('49000000-0000-4000-8000-000000000001','Synthetic recovery','QA','en');
SAVEPOINT before_forgetting;
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','49000000-0000-4000-8000-000000000001',true);
SELECT fieldmaps_private.forget_user();
SELECT pg_temp.assert_true(
    (SELECT count(*)=1 FROM fieldmaps_private.account_deletions
     WHERE user_id='49000000-0000-4000-8000-000000000001'),
    'forgetting atomically creates one durable external deletion');
SELECT fieldmaps_private.forget_user();
SELECT pg_temp.assert_true(
    (SELECT count(*)=1 FROM fieldmaps_private.account_deletions
     WHERE user_id='49000000-0000-4000-8000-000000000001'),
    'repeated forgetting does not duplicate pending work');
SELECT pg_temp.assert_rejected(
    $$INSERT INTO fieldmaps_private.account_deletions(user_id)
      VALUES ('49000000-0000-4000-8000-000000000001')$$,'42501',
    'runtime cannot enqueue an arbitrary account');
SELECT pg_temp.assert_rejected(
    $$UPDATE fieldmaps_private.account_deletions SET user_id=user_id$$,'42501',
    'runtime cannot retarget an existing deletion');
RESET ROLE;
SELECT pg_temp.assert_true(
    (SELECT deleted_at IS NOT NULL AND display_name IS NULL
       AND observer_initials IS NULL AND locale IS NULL
     FROM fieldmaps.profiles WHERE user_id='49000000-0000-4000-8000-000000000001'),
    'atomic forgetting still anonymizes the profile');
ROLLBACK TO before_forgetting;
RELEASE SAVEPOINT before_forgetting;
SELECT pg_temp.assert_true(
    (SELECT deleted_at IS NULL AND display_name='Synthetic recovery'
     FROM fieldmaps.profiles WHERE user_id='49000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT FROM fieldmaps_private.account_deletions
                    WHERE user_id='49000000-0000-4000-8000-000000000001'),
    'rollback preserves profile and creates no recovery job');
SELECT pg_temp.assert_true(
    (SELECT relrowsecurity FROM pg_class
     WHERE oid='fieldmaps_private.account_deletions'::regclass)
    AND NOT has_table_privilege('authenticated','fieldmaps_private.account_deletions','SELECT')
    AND NOT has_table_privilege('anon','fieldmaps_private.account_deletions','SELECT')
    AND NOT has_table_privilege('service_role','fieldmaps_private.account_deletions','SELECT')
    AND NOT has_function_privilege('fieldmaps_api','fieldmaps_private.enqueue_account_deletion()','EXECUTE'),
    'recovery remains private and trigger-only enqueue is not a callable API');
