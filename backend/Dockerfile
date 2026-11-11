FROM python:3.13-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.10.9 /uv /bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
ENV PATH="/app/.venv/bin:$PATH"

FROM base AS production-dependencies
RUN uv sync --frozen --no-dev --no-install-project

FROM base AS test
RUN uv sync --frozen --no-install-project
COPY --from=docker:29-cli /usr/local/bin/docker /usr/local/bin/docker
COPY src ./src
COPY tests ./tests
COPY certs ./certs
COPY config.local.json config.auth-local.json config.hosted.json config.render.json ./
COPY Dockerfile .dockerignore ./
CMD ["pytest"]

FROM python:3.13-slim AS runtime
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1
RUN apt-get update && apt-get install --no-install-recommends -y libexpat1 && rm -rf /var/lib/apt/lists/*
RUN groupadd --gid 10001 fieldmaps && useradd --uid 10001 --gid fieldmaps --no-create-home fieldmaps
COPY --from=production-dependencies /app/.venv ./.venv
COPY src ./src
COPY certs ./certs
COPY config.local.json config.auth-local.json config.hosted.json config.render.json ./
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/health', timeout=3).close()"
CMD ["sh", "-c", "exec uvicorn --app-dir src fieldmaps_api.main:create_app_from_config --factory --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
