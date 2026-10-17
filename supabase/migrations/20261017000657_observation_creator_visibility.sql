-- Forward correction: applied baselines must not be edited to change existing installations.
-- Keep project membership/account checks even for the immutable creator, so revocation
-- still hides their records. Organization owners/admins inherit manager authority.
ALTER POLICY assigned_observations ON fieldmaps.observations
USING (
  project_id IN (SELECT fieldmaps_private.my_project_ids())
  AND EXISTS (
    SELECT FROM fieldmaps.projects p
    WHERE p.id = observations.project_id
      AND (
        observations.created_by = fieldmaps.request_user_id()
        OR (
          NOT p.is_training
          AND fieldmaps_private.has_project_role(p.id, ARRAY['manager', 'viewer'])
        )
      )
  )
);

COMMENT ON POLICY assigned_observations ON fieldmaps.observations IS
  'Current project members read their own immutable uploads; research reviewers also read collaborators. Training is creator-only.';
