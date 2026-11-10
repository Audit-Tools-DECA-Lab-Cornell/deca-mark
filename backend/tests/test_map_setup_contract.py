from fastapi.openapi.models import OpenAPI, PathItem, Response, Schema

from fieldmaps_api.openapi import export_openapi


def response_for(path: PathItem, status: str) -> Response:
    """Return one declared POST response from a validated OpenAPI path."""
    assert path.post is not None
    assert path.post.responses is not None
    return Response.model_validate(path.post.responses[status])


def response_schema(response: Response) -> Schema:
    """Read the JSON response-model reference from a successful response."""
    assert response.content is not None
    media = response.content["application/json"]
    assert media.schema_ is not None
    return Schema.model_validate(media.schema_)


def test_map_setup_import_and_publish_declare_new_and_replayed_successes() -> None:
    document = OpenAPI.model_validate_json(export_openapi())
    assert document.paths is not None
    imported = PathItem.model_validate(
        document.paths["/v1/projects/{project_id}/sites/{site_id}/map-setups/import"]
    )
    published = PathItem.model_validate(
        document.paths["/v1/projects/{project_id}/sites/{site_id}/map-setups/{setup_id}/publish"]
    )

    for status in ("200", "201"):
        import_response = response_for(imported, status)
        assert response_schema(import_response).ref == "#/components/schemas/MapSetup"
        assert import_response.headers is not None
        assert "ETag" in import_response.headers
        assert response_schema(response_for(published, status)).ref == (
            "#/components/schemas/Publication"
        )


def test_map_setup_collection_contract_returns_summaries_only() -> None:
    document = OpenAPI.model_validate_json(export_openapi())
    assert document.paths is not None
    collection = PathItem.model_validate(
        document.paths["/v1/projects/{project_id}/sites/{site_id}/map-setups"]
    )
    assert collection.get is not None
    assert collection.get.responses is not None
    response = Response.model_validate(collection.get.responses["200"])
    assert response.content is not None
    media = response.content["application/json"]
    assert media.schema_ is not None
    schema = Schema.model_validate(media.schema_)
    assert schema.type == "array"
    assert schema.items is not None
    assert Schema.model_validate(schema.items).ref == "#/components/schemas/MapSetupSummary"
