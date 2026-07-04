#!/usr/bin/env python3
from __future__ import annotations

from python_header import env

import argparse
import csv
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ACCOUNT_RE = re.compile(r"^NEXTCLOUD_URL(?:_(\d+))?$")


@dataclass(frozen=True)
class SyncPair:
    remote: str
    local: Path


@dataclass(frozen=True)
class Account:
    index: int
    suffix: str
    url: str
    user: str
    password: str
    folders: tuple[SyncPair, ...]
    timer: str


def value(field: str, suffix: str) -> str:
    return env.get(f"NEXTCLOUD_{field}{suffix}", "").strip()


def parse_folders(raw: str) -> tuple[SyncPair, ...]:
    pairs: list[SyncPair] = []
    for entry in next(csv.reader([raw], skipinitialspace=True), []):
        local, separator, remote = entry.partition("|")
        if not separator or not remote.strip() or not local.strip():
            raise ValueError(f"Invalid NEXTCLOUD_SYNC_FOLDERS entry: {entry!r}")
        local_path = Path(local.strip()).expanduser()
        if not local_path.is_absolute():
            raise ValueError(f"Nextcloud local path must be absolute: {local_path}")
        pairs.append(SyncPair(remote.strip(), local_path))
    if not pairs:
        raise ValueError("NEXTCLOUD_SYNC_FOLDERS contains no folder pairs")
    return tuple(pairs)


def accounts() -> list[Account]:
    indexes = {1}
    for key in env:
        match = ACCOUNT_RE.match(key)
        if match and match.group(1):
            indexes.add(int(match.group(1)))
    result: list[Account] = []
    for index in sorted(indexes):
        suffix = "" if index == 1 else f"_{index:02d}"
        url = value("URL", suffix).rstrip("/")
        user = value("USER", suffix)
        password = value("PW", suffix)
        folders = value("SYNC_FOLDERS", suffix)
        if not any((url, user, password)):
            continue
        missing = [name for name, item in (("URL", url), ("USER", user), ("PW", password)) if not item]
        if missing:
            raise ValueError(f"NEXTCLOUD account {index} is incomplete: {', '.join(missing)}")
        parsed_folders = parse_folders(folders) if folders else ()
        result.append(Account(index, suffix, url, user, password, parsed_folders, value("TIMER", suffix)))
    return result


def binary() -> Path:
    candidates = [
        Path(os.environ.get("NEXTCLOUDCMD", "")),
        ROOT / "runtime/opt/nextcloudcmd/bin/nextcloudcmd",
        Path("/opt/nextcloudcmd/bin/nextcloudcmd"),
    ]
    found = shutil.which("nextcloudcmd")
    if found:
        candidates.append(Path(found))
    for candidate in candidates:
        if str(candidate) and candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate
    raise FileNotFoundError("nextcloudcmd runtime not found")


def sync_account(account: Account) -> int:
    if not account.folders:
        print(f"NEXTCLOUD {account.index}: file sync disabled", flush=True)
        return 0
    executable = binary()
    child_env = dict(os.environ)
    child_env.update(NC_USER=account.user, NC_PASSWORD=account.password)
    for pair in account.folders:
        pair.local.mkdir(parents=True, exist_ok=True)
        command = [str(executable), "--non-interactive"]
        if pair.remote.rstrip("/"):
            command.extend(["--path", pair.remote])
        command.extend([str(pair.local), account.url])
        print(f"NEXTCLOUD {account.index}: {pair.remote} -> {pair.local}", flush=True)
        completed = subprocess.run(command, env=child_env, check=False)
        if completed.returncode:
            return completed.returncode
    return 0


def status_text(configured: list[Account]) -> str:
    if not configured:
        return "NEXTCLOUD: no accounts configured."
    lines = ["NEXTCLOUD"]
    for account in configured:
        lines.append(f"Account {account.index}: {account.url} ({account.user}), timer={account.timer or '0'}")
        lines.extend(f"  {pair.remote} -> {pair.local}" for pair in account.folders)
    return "\n".join(lines)


def initialize(configured: list[Account]) -> None:
    for account in configured:
        for pair in account.folders:
            pair.local.mkdir(parents=True, exist_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--account", type=int)
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--init", action="store_true")
    args = parser.parse_args()
    configured = accounts()
    if args.init:
        initialize(configured)
        print("NEXTCLOUD directories initialized.")
        return 0
    if args.status:
        print(status_text(configured))
        return 0
    selected = [item for item in configured if args.account in (None, item.index)]
    if not selected:
        print("NEXTCLOUD: requested account is not configured.", file=sys.stderr)
        return 2
    for account in selected:
        result = sync_account(account)
        if result:
            return result
    print("NEXTCLOUD sync completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
