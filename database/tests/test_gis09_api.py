"""Select the current GIS acceptance scenario after the BE-22 runtime gate."""

from tests.conftest import signer
from tests.gis_current_acceptance import test_v1_v2_gis_readback_matches_signed_exports

__all__ = ["signer", "test_v1_v2_gis_readback_matches_signed_exports"]
