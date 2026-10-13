.PHONY: openapi email-templates email-templates-check

openapi:
	uv run --frozen --no-sync --offline --directory . -- python -m fieldmaps_api.openapi > ../contracts/openapi.json.tmp
	mv ../contracts/openapi.json.tmp ../contracts/openapi.json

export PYTHONPATH := src

email-templates:
	uv run --frozen --no-sync --offline --directory . -- python -m fieldmaps_api.email.generate

email-templates-check:
	uv run --frozen --no-sync --offline --directory . -- python -m fieldmaps_api.email.generate --check
