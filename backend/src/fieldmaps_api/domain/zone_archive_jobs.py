from typing import Annotated, ClassVar, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from fieldmaps_api.domain.packages import OnlineBasemap
from fieldmaps_api.domain.zone_package_schemas import PackageIdentity
from fieldmaps_api.zone_import_schemas import PackageRequest
from fieldmaps_api.zone_response_schemas import ImportValidation, PackageForms


class ArchiveJob(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)


class PublishJob(ArchiveJob):
    operation: Literal["publish"] = "publish"
    identity: PackageIdentity
    forms: PackageForms
    validation: ImportValidation


class ImportJob(ArchiveJob):
    operation: Literal["import"] = "import"
    identity: PackageIdentity
    forms: PackageForms
    validation: ImportValidation
    submission: PackageRequest


type Job = Annotated[PublishJob | ImportJob, Field(discriminator="operation")]
JOBS = TypeAdapter[Job](Job)


#: What the archive worker leaves in its directory when it refuses a job (exit status 2): its own
#: sentence, and for an online background map question the layers it names.
REASON_FILE: Final = "error.txt"
ONLINE_BASEMAPS_FILE: Final = "online-basemaps.json"
BASEMAPS: Final = TypeAdapter(tuple[OnlineBasemap, ...])
