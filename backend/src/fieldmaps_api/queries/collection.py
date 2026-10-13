from typing import Final

from sqlalchemy import text

AUTHORIZE_UPLOAD: Final = text("SELECT fieldmaps_private.assert_zone_observer(:project)")

STORED_RECEIPT: Final = text("""
SELECT json_build_object('observation_id', id, 'project_id', project_id,
  'user_id', created_by, 'accepted_revision', 1, 'received_at', received_at,
  'upload_hash', upload_hash, 'package_id', package_id, 'zone_id', zone_id)::text
FROM fieldmaps.observations WHERE id = :id
""")
