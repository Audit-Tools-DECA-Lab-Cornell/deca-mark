def body_parts(
    location: tuple[str | int, ...], error_type: str, *, bound_upload: bool
) -> list[str | int]:
    if not location or location[0] != "body" or error_type == "json_invalid":
        return []
    parts = list(location[1:])
    if not bound_upload:
        return [part for part in parts if part not in {"Polygon", "MultiPolygon"}]
    if parts and parts[0] in {"standard", "reliability", "inventory"}:
        parts = parts[1:]
    if parts and parts[0] == "answers":
        return parts[:2]
    return parts
