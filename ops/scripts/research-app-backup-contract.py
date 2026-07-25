#!/usr/bin/env python3
import ctypes
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import sys

KEYS = (
    "FORMAT_VERSION",
    "POSTGRES_IMAGE",
    "POSTGRES_VERSION",
    "SOURCE_TIMESCALE_VERSION",
    "SOURCE_POSTGIS_VERSION",
    "SOURCE_VECTOR_VERSION",
    "SOURCE_GLOBALS_SHA256",
    "DATABASE_OWNER",
    "SOURCE_CONTENT_PACK_ITEMS",
    "SOURCE_SEALED_DERIVATIONS",
    "SOURCE_INVALID_INDEXES",
    "SOURCE_HYPERTABLES",
    "SOURCE_TIMESCALE_JOBS",
    "DUMP_SEQUENCE_COUNT",
    "SOURCE_CAPTURED_AT",
)
SHA256 = re.compile(r"^[0-9a-f]{64}$")
VERSION = re.compile(r"^[0-9]+(?:\.[0-9]+){1,3}$")
OWNER = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")
IMAGE = re.compile(r"^[a-z0-9._/-]+@sha256:[0-9a-f]{64}$")
INTEGER_KEYS = {
    "SOURCE_CONTENT_PACK_ITEMS",
    "SOURCE_SEALED_DERIVATIONS",
    "SOURCE_INVALID_INDEXES",
    "SOURCE_HYPERTABLES",
    "SOURCE_TIMESCALE_JOBS",
    "DUMP_SEQUENCE_COUNT",
}
SETVAL = re.compile(
    r"^SELECT pg_catalog\.setval\('((?:''|[^'])+)', (-?[0-9]+), (true|false)\);$"
)

def parse_metadata(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw or raw.startswith("#"):
            continue
        if "=" not in raw:
            raise ValueError(f"metadata line {number} is not key=value")
        key, value = raw.split("=", 1)
        if key in values:
            raise ValueError(f"duplicate metadata key: {key}")
        if key not in KEYS:
            raise ValueError(f"unknown metadata key: {key}")
        values[key] = value
    missing = set(KEYS) - values.keys()
    if missing:
        raise ValueError(f"missing metadata keys: {','.join(sorted(missing))}")
    if values["FORMAT_VERSION"] != "3":
        raise ValueError("unsupported FORMAT_VERSION")
    if not IMAGE.fullmatch(values["POSTGRES_IMAGE"]):
        raise ValueError("invalid POSTGRES_IMAGE")
    for key in ("POSTGRES_VERSION", "SOURCE_TIMESCALE_VERSION", "SOURCE_POSTGIS_VERSION", "SOURCE_VECTOR_VERSION"):
        if not VERSION.fullmatch(values[key]):
            raise ValueError(f"invalid {key}")
    for key in ("SOURCE_GLOBALS_SHA256",):
        if not SHA256.fullmatch(values[key]):
            raise ValueError(f"invalid {key}")
    if not OWNER.fullmatch(values["DATABASE_OWNER"]):
        raise ValueError("invalid DATABASE_OWNER")
    for key in INTEGER_KEYS:
        if not values[key].isdigit():
            raise ValueError(f"invalid {key}")
    if values["SOURCE_INVALID_INDEXES"] != "0":
        raise ValueError("source backup has invalid indexes")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", values["SOURCE_CAPTURED_AT"]):
        raise ValueError("invalid SOURCE_CAPTURED_AT")
    return values


def parse_sequence_sql(path: Path) -> list[tuple[str, int, bool]]:
    result: list[tuple[str, int, bool]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if "setval" not in line:
            continue
        match = SETVAL.fullmatch(line)
        if not match:
            raise ValueError(f"invalid sequence set statement: {line[:120]}")
        name, value, called = match.groups()
        result.append((name.replace("''", "'"), int(value), called == "true"))
    names = [name for name, _, _ in result]
    if not result or len(names) != len(set(names)):
        raise ValueError("empty or duplicate dump sequence manifest")
    return sorted(result)


def sequence_validation_sql(path: Path) -> str:
    lines = [
        "DO $sequence_parity$",
        "DECLARE actual_last bigint; actual_called boolean; sequence_oid regclass;",
        "BEGIN",
    ]
    for name, expected_last, expected_called in parse_sequence_sql(path):
        literal = name.replace("'", "''")
        lines.extend(
            [
                f"  sequence_oid := to_regclass('{literal}');",
                f"  IF sequence_oid IS NULL THEN RAISE EXCEPTION 'missing sequence: {literal}'; END IF;",
                "  EXECUTE format('SELECT last_value::bigint, is_called FROM %s', sequence_oid) INTO actual_last, actual_called;",
                f"  IF actual_last <> {expected_last} OR actual_called <> {str(expected_called).lower()} THEN",
                f"    RAISE EXCEPTION 'sequence parity mismatch: {literal}';",
                "  END IF;",
            ]
        )
    lines.extend(["END", "$sequence_parity$;"])
    return "\n".join(lines) + "\n"


def fsync_tree(root: Path) -> None:
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"symlink not allowed: {path}")
        if path.is_file():
            with path.open("rb") as handle:
                os.fsync(handle.fileno())
    directories = [p for p in root.rglob("*") if p.is_dir()]
    for directory in sorted(directories, key=lambda p: len(p.parts), reverse=True):
        fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def rename_noreplace(source: Path, target: Path) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)
    if renameat2 is None:
        if target.exists():
            raise FileExistsError(target)
        os.rename(source, target)
        return
    result = renameat2(-100, os.fsencode(source), -100, os.fsencode(target), 1)
    if result != 0:
        err = ctypes.get_errno()
        raise OSError(err, os.strerror(err), str(target))

def atomic_publish(source: Path, target: Path) -> None:
    if source.parent != target.parent:
        raise ValueError("atomic publish requires one parent filesystem")
    fsync_tree(source)
    rename_noreplace(source, target)
    parent_fd = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(parent_fd)
    finally:
        os.close(parent_fd)

def verify_backup_directory(root: Path) -> None:
    expected_names = ("research_app.dump", "globals.sql", "RESTORE_METADATA")
    rows = (root / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
    if len(rows) != len(expected_names):
        raise ValueError("SHA256SUMS must contain exactly three entries")
    seen: dict[str, str] = {}
    for row in rows:
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9_.-]+)", row)
        if not match:
            raise ValueError("invalid SHA256SUMS row")
        digest, name = match.groups()
        if name in seen or name not in expected_names:
            raise ValueError(f"unexpected or duplicate checksum entry: {name}")
        seen[name] = digest
    if set(seen) != set(expected_names):
        raise ValueError("missing checksum entry")
    for name, expected in seen.items():
        actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"checksum mismatch: {name}")
    parse_metadata(root / "RESTORE_METADATA")

def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: research-app-backup-contract.py validate|verify|publish|sequence-count|sequence-validation-sql ...")
    command = sys.argv[1]
    if command == "validate" and len(sys.argv) == 3:
        print(json.dumps(parse_metadata(Path(sys.argv[2])), sort_keys=True))
        return
    if command == "verify" and len(sys.argv) == 3:
        verify_backup_directory(Path(sys.argv[2]).resolve())
        print("backup_directory=PASS")
        return
    if command == "publish" and len(sys.argv) == 4:
        atomic_publish(Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve())
        print(f"published={Path(sys.argv[3]).resolve()}")
        return
    if command == "sequence-count" and len(sys.argv) == 3:
        print(len(parse_sequence_sql(Path(sys.argv[2]))))
        return
    if command == "sequence-validation-sql" and len(sys.argv) == 3:
        print(sequence_validation_sql(Path(sys.argv[2])), end="")
        return
    raise SystemExit("invalid command")

if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"backup contract failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
