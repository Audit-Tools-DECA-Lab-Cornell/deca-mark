"""Select the current GIS acceptance scenario after the BE-22 runtime gate."""

from tests.conftest import api_client, signer
from tests.gis_current_acceptance import (
    gis_workspace,
    test_v1_v2_gis_readback_matches_signed_exports,
)

__all__ = [
    "api_client",
    "gis_workspace",
    "signer",
    "test_v1_v2_gis_readback_matches_signed_exports",
]
