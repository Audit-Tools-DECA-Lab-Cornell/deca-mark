import re
import socket
from http import HTTPStatus
from typing import Literal
from uuid import UUID

import anyio
import httpx2
import orjson
import sentry_sdk
from pydantic import JsonValue, SecretStr, TypeAdapter, ValidationError

from fieldmaps_api.config import Settings
from fieldmaps_api.errors import StorageUnavailableError
from fieldmaps_api.observability import LOGGER


async def admin_key(settings: Settings) -> SecretStr:
    """Check deletion configuration before changing any account data."""
    if settings.auth_admin_key_file is None or settings.issuer is None:
        message = "Account deletion requires Auth Admin configuration"
        raise StorageUnavailableError(message)
    try:
        value = (await anyio.Path(settings.auth_admin_key_file).read_text()).strip()
    except (OSError, UnicodeError):
        message = "Account deletion Auth Admin key is unavailable"
        raise StorageUnavailableError(message) from None
    if re.fullmatch(r"sb_secret_[!-~]+", value) is None:
        message = "Account deletion Auth Admin key is unavailable"
        raise StorageUnavailableError(message)
    return SecretStr(value)


type DeleteOutcome = Literal["complete", "provider_unavailable", "permission", "configuration"]


async def delete_auth_user(settings: Settings, key: SecretStr, user_id: UUID) -> DeleteOutcome:
    """Make two bounded attempts after the durable database deletion has committed."""
    limits = httpx2.Limits(max_connections=2, max_keepalive_connections=1, keepalive_expiry=30)
    transport = httpx2.AsyncHTTPTransport(
        http2=True,
        retries=0,
        limits=limits,
        socket_options=[(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)],
    )
    # Do not forward the administrative credential to a redirect destination.
    async with httpx2.AsyncClient(
        transport=transport,
        timeout=httpx2.Timeout(5.0),
        follow_redirects=False,
        trust_env=False,
    ) as client:
        outcome: DeleteOutcome = "provider_unavailable"
        for _attempt in range(2):
            try:
                with anyio.fail_after(10):
                    response = await client.delete(
                        f"{str(settings.issuer).rstrip('/')}/admin/users/{user_id}",
                        headers={
                            "apikey": key.get_secret_value(),
                            "X-Supabase-Api-Version": "2024-01-01",
                        },
                    )
                if response.status_code in (HTTPStatus.OK, HTTPStatus.NO_CONTENT):
                    return "complete"
                if response.status_code == HTTPStatus.NOT_FOUND:
                    try:
                        value = TypeAdapter[dict[str, JsonValue]](
                            dict[str, JsonValue]
                        ).validate_json(response.content)
                    except ValidationError:
                        value = None
                    if value is not None and (
                        value.get("code") == "user_not_found"
                        or value.get("error_code") == "user_not_found"
                    ):
                        return "complete"
                if response.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN):
                    outcome = "permission"
                    break
                if (
                    response.status_code
                    not in (HTTPStatus.REQUEST_TIMEOUT, HTTPStatus.TOO_MANY_REQUESTS)
                    and response.status_code < HTTPStatus.INTERNAL_SERVER_ERROR
                ):
                    outcome = "configuration"
                    break
            except (httpx2.RequestError, TimeoutError):
                continue
    LOGGER.error(
        orjson.dumps({"event": "account_deletion_pending", "user_id": str(user_id)}).decode()
    )
    sentry_sdk.capture_event(
        {"message": "Account deletion pending", "level": "error", "user": {"id": str(user_id)}}
    )
    return outcome
