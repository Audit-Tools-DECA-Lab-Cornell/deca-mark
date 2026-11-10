from uuid import UUID

import pytest

from fieldmaps_api.domain.map_setup_compilation import compile_package
from fieldmaps_api.errors import DomainError
from fieldmaps_api.map_setup_schemas import MapSetupReplace

SITE = UUID("10000000-0000-4000-8000-000000000003")
REQUEST = UUID("10000000-0000-4000-8000-000000000004")


def test_incomplete_setup_cannot_compile_for_observers() -> None:
    # Given an acknowledged draft without boundaries or form.
    content = MapSetupReplace(import_generation=1)
    # When publication assembly is requested.
    with pytest.raises(DomainError) as failure:
        compile_package(SITE, REQUEST, None, content, [], [], None)
    # Then a typed validation rejection retains the draft.
    assert failure.value.code == "validation_failed"
