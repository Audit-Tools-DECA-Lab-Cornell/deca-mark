import json
from collections.abc import Sequence
from typing import Final

from pydantic import JsonValue, TypeAdapter, ValidationError

JSON_VALUE: Final = TypeAdapter[JsonValue](JsonValue)
MAX_INTEGER_DIGITS: Final = 16


class InvalidUploadJSONError(ValueError):
    pass


def unique_object(pairs: Sequence[tuple[str, JsonValue]]) -> dict[str, JsonValue]:
    result: dict[str, JsonValue] = {}
    for key, value in pairs:
        if key in result:
            raise InvalidUploadJSONError
        key.encode("utf-8")
        result[key] = value
    return result


def reject_constant(_value: str) -> JsonValue:
    raise InvalidUploadJSONError


def parse_integer(value: str) -> int:
    if len(value.lstrip("-")) > MAX_INTEGER_DIGITS:
        raise InvalidUploadJSONError
    return int(value)


def validate_unicode(value: JsonValue) -> None:
    match value:
        case str():
            value.encode("utf-8")
        case list():
            for item in value:
                validate_unicode(item)
        case dict():
            for item in value.values():
                validate_unicode(item)
        case _:
            pass


def validate_upload_json(body: bytes) -> None:
    value = JSON_VALUE.validate_python(
        json.loads(
            body.decode("utf-8"),
            object_pairs_hook=unique_object,
            parse_constant=reject_constant,
            parse_int=parse_integer,
        )
    )
    validate_unicode(value)


def valid_upload_json(body: bytes) -> bool:
    try:
        validate_upload_json(body)
    except (
        InvalidUploadJSONError,
        json.JSONDecodeError,
        UnicodeError,
        RecursionError,
        ValidationError,
    ):
        return False
    return True
