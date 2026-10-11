import re
import subprocess
from os import environ
from pathlib import Path
from shutil import which


def disposable_database_selected() -> bool:
    has_url = "DECAMARK_TEST_DATABASE_URL" in environ
    has_container = "DECAMARK_TEST_DATABASE_CONTAINER" in environ
    if has_url != has_container:
        msg = "Select both disposable database URL and container to keep fixture writes isolated"
        raise ValueError(msg)
    if (
        has_container
        and re.fullmatch(r"fieldmaps-zone-api-[0-9]+", environ["DECAMARK_TEST_DATABASE_CONTAINER"])
        is None
    ):
        msg = "Disposable database container must have the zone API rehearsal prefix"
        raise ValueError(msg)
    return has_url


def admin_sql(statement: str, *variables: str) -> str:
    docker = which("docker")
    if docker is None:
        msg = "Docker is required for local database tests"
        raise FileNotFoundError(msg)
    disposable = disposable_database_selected()
    container = environ.get("DECAMARK_TEST_DATABASE_CONTAINER", "supabase_db_field-maps")
    result = subprocess.run(  # noqa: S603 - validated local container, argv only; SQL over stdin.
        [
            docker,
            "exec",
            "-i",
            container,
            "psql",
            *(["-h", "127.0.0.1"] if disposable else []),
            "-X",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
            "-Atq",
            *[argument for variable in variables for argument in ("-v", variable)],
        ],
        input=statement,
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout.strip()


def database_url() -> str:
    disposable_database_selected()
    disposable = environ.get("DECAMARK_TEST_DATABASE_URL")
    if disposable is not None:
        if (
            re.fullmatch(
                r"postgresql\+asyncpg://fieldmaps_api@127\.0\.0\.1:[0-9]{1,5}/postgres", disposable
            )
            is None
        ):
            msg = "Disposable test database URL must target the loopback fieldmaps_api role"
            raise ValueError(msg)
        return disposable
    host = "host.docker.internal" if environ.get("DECAMARK_CONTAINER_TESTS") == "1" else "127.0.0.1"
    return f"postgresql+asyncpg://fieldmaps_api@{host}:54322/postgres"


def password_file() -> Path | None:
    return (
        None
        if disposable_database_selected()
        else Path(__file__).resolve().parents[2] / "database/.local/fieldmaps-api-password"
    )
