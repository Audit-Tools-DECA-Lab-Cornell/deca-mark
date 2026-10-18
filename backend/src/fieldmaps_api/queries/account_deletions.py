"""Private deletion claims; no provider I/O takes place in these transactions."""

from typing import Final

from sqlalchemy import text

CLAIM: Final = text("""
WITH due AS (
    SELECT user_id FROM fieldmaps_private.account_deletions
    WHERE next_attempt_at <= now() AND (lease_until IS NULL OR lease_until <= now())
      AND (CAST(:user_id AS uuid) IS NULL OR user_id = CAST(:user_id AS uuid))
    ORDER BY next_attempt_at, user_id FOR UPDATE SKIP LOCKED LIMIT 1
)
UPDATE fieldmaps_private.account_deletions d SET
    lease_token = :lease, lease_until = now() + interval '60 seconds',
    attempts = least(attempts,1000) + 1, last_attempt_at = now()
FROM due WHERE d.user_id = due.user_id
RETURNING d.user_id, d.attempts, d.lease_token
""")
COMPLETE: Final = text("""
DELETE FROM fieldmaps_private.account_deletions WHERE user_id = :user AND lease_token = :lease
""")
RETRY: Final = text("""
UPDATE fieldmaps_private.account_deletions SET
    next_attempt_at = now() + :delay, last_error = :error, lease_token = NULL, lease_until = NULL
WHERE user_id = :user AND lease_token = :lease
""")
PENDING: Final = text("""
SELECT EXISTS (SELECT FROM fieldmaps_private.account_deletions WHERE user_id = :user)
""")
