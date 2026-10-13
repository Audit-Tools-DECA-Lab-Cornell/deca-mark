import socket
from pathlib import Path
from typing import Never

import pytest
from fastapi.openapi.models import OpenAPI, PathItem, Response
from jwt import PyJWKClient
from sqlalchemy.ext.asyncio import AsyncEngine

from fieldmaps_api.openapi import export_openapi


def test_export_is_deterministic_without_external_io(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden_io() -> Never:
        message = "OpenAPI export must not perform external I/O"
        raise AssertionError(message)

    monkeypatch.setenv("DECAMARK_CONFIG", "/nonexistent/openapi-config.json")
    monkeypatch.setattr(Path, "read_text", forbidden_io)
    monkeypatch.setattr(Path, "read_bytes", forbidden_io)
    monkeypatch.setattr(socket.socket, "connect", forbidden_io)
    monkeypatch.setattr(AsyncEngine, "connect", forbidden_io)
    monkeypatch.setattr(PyJWKClient, "fetch_data", forbidden_io)
    assert export_openapi() == export_openapi()


def test_committed_contract_matches_export() -> None:
    contract = Path(__file__).resolve().parents[2] / "contracts/openapi.json"
    assert contract.read_bytes() == export_openapi()


def test_operations_have_stable_ids_and_typed_responses() -> None:
    document = OpenAPI.model_validate_json(export_openapi())
    assert document.paths is not None
    identifiers: set[str] = set()
    for raw_path in document.paths.values():
        path = PathItem.model_validate(raw_path)
        for operation in (path.get, path.put, path.post, path.patch, path.delete):
            if operation is None:
                continue
            assert operation.operationId
            assert operation.operationId not in identifiers
            identifiers.add(operation.operationId)
            assert operation.responses
            assert "422" in operation.responses
            assert "503" in operation.responses
            for status, raw_response in operation.responses.items():
                response = Response.model_validate(raw_response)
                if status == "204":
                    assert not response.content
                    continue
                assert response.content
                if status.startswith("2"):
                    assert all(media.schema_ is not None for media in response.content.values())
                else:
                    error = response.content["application/json"].schema_
                    assert error is not None
                    assert error.ref == "#/components/schemas/ErrorEnvelope"
    assert {
        "health",
        "listProjects",
        "uploadObservation",
        "listHistoricalObservations",
        "getHistoricalObservation",
        "createPackage",
        "listPackages",
        "getPackage",
        "downloadPackageArchive",
    } <= identifiers
    archive = PathItem.model_validate(
        document.paths["/v1/projects/{project_id}/packages/{package_id}/archive"]
    ).get
    assert archive is not None
    assert archive.responses is not None
    response = Response.model_validate(archive.responses["200"])
    assert response.content is not None
    assert set(response.content) == {"application/zip"}
