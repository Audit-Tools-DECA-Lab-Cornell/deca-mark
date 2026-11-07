"""Reading a `.qgz` for provenance and for the questions a GeoJSON export cannot answer.

The exported layers carry the geometry; the project file carries the author's intent — which
layers belong to the site, and what imagery sits under them. Both matter at preparation time:
one tells a manager that an export is missing, the other decides whether a package may legally
be built at all.

The file is uploaded, so it is untrusted. It is opened as a zip with a declared-size ceiling,
and its XML is parsed with entity declarations refused, which closes both the expansion and the
external-entity routes without adding a dependency.
"""

from __future__ import annotations

import re
import zipfile
from io import BytesIO
from typing import Final
from urllib.parse import parse_qs, urlparse
from xml.etree import ElementTree  # noqa: ICN001

MAX_MEMBERS: Final = 64
MAX_UNCOMPRESSED_BYTES: Final = 64 * 1024 * 1024
MAX_DOCUMENT_BYTES: Final = 32 * 1024 * 1024


class ProjectFileError(ValueError):
    """A project file that cannot be read, with a reason worth showing the manager."""


# Strip QGIS's standard inert header; reject every other declaration before XML parsing.
_DECLARATION: Final = re.compile(r"<!\s*(?:DOCTYPE|ENTITY)", re.IGNORECASE)
_QGIS_DOCTYPE: Final = re.compile(
    r"<!DOCTYPE\s+qgis\s+PUBLIC\s+(['\"])http://mrcc\.com/qgis\.dtd\1\s+(['\"])SYSTEM\2\s*>",
)

REFUSAL: Final = "The project file declares XML entities, which DECA Mark does not read"


def read_document(content: bytes) -> str:
    """Pull the `.qgs` XML out of a `.qgz`, or accept a bare `.qgs`."""
    if not content:
        message = "The project file is empty"
        raise ProjectFileError(message)
    if not zipfile.is_zipfile(BytesIO(content)):
        # QGIS also writes plain `.qgs` XML; accepting it saves a manager a confusing rejection.
        return _decode(content)
    with zipfile.ZipFile(BytesIO(content)) as archive:
        entries = archive.infolist()
        if len(entries) > MAX_MEMBERS:
            message = f"The project archive holds {len(entries)} files, more than a project needs"
            raise ProjectFileError(message)
        if sum(entry.file_size for entry in entries) > MAX_UNCOMPRESSED_BYTES:
            message = "The project archive expands to more than DECA Mark will read"
            raise ProjectFileError(message)
        documents = [entry for entry in entries if entry.filename.lower().endswith(".qgs")]
        if not documents:
            message = "No .qgs document inside the .qgz archive"
            raise ProjectFileError(message)
        document = documents[0]
        if document.file_size > MAX_DOCUMENT_BYTES:
            message = "The project document is larger than DECA Mark will read"
            raise ProjectFileError(message)
        return _decode(archive.read(document))


def _decode(payload: bytes) -> str:
    try:
        return payload.decode()
    except UnicodeDecodeError as error:
        message = "The project file is not UTF-8 text"
        raise ProjectFileError(message) from error


def parse(document: str) -> ElementTree.Element:
    document = _QGIS_DOCTYPE.sub("", document)
    if _DECLARATION.search(document):
        raise ProjectFileError(REFUSAL)
    try:
        # Safe by the guard above: without a DTD there is no entity to expand or resolve.
        return ElementTree.fromstring(document)  # noqa: S314
    except ElementTree.ParseError as error:
        message = f"The project file is not readable XML: {error}"
        raise ProjectFileError(message) from error


def title(root: ElementTree.Element) -> str | None:
    return _text(root.find("title"))


def project_crs(root: ElementTree.Element) -> str | None:
    return _text(root.find("./projectCrs/spatialrefsys/authid"))


def map_layers(root: ElementTree.Element) -> list[ElementTree.Element]:
    return list(root.iter("maplayer"))


def layer_name(layer: ElementTree.Element) -> str | None:
    return _text(layer.find("layername"))


def layer_provider(layer: ElementTree.Element) -> str:
    return (_text(layer.find("provider")) or "").lower()


def layer_kind(layer: ElementTree.Element) -> str:
    return (layer.get("type") or "").lower()


def datasource_host(layer: ElementTree.Element) -> str | None:
    """Read the host a network raster layer fetches from, out of its datasource string.

    QGIS stores a tile or WMS source as `&`-joined key/value pairs with the service URL under
    `url`. Anything without one is a file on disk, which has no host. A URL that cannot be parsed
    is a tile service whose host is unknown: OpenStreetMap's own `https://[abc].tile...` subdomain
    pattern reads as a malformed IPv6 address, and that must not stop the project being read.
    """
    source = _text(layer.find("datasource"))
    if source is None:
        return None
    fields = parse_qs(source.replace("&amp;", "&"), keep_blank_values=False)
    urls = fields.get("url") or fields.get("URL")
    if not urls:
        return None
    try:
        return urlparse(urls[0].strip()).hostname
    except ValueError:
        return None


def _text(element: ElementTree.Element | None) -> str | None:
    if element is None or element.text is None:
        return None
    return element.text.strip() or None
