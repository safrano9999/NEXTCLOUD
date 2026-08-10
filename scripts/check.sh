#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
node --check "$root/index.js"
PYTHONPYCACHEPREFIX="${TMPDIR:-/tmp}/nextcloud-pycache" python3 -m py_compile \
  "$root/calendar_fetch.py" "$root/nextcloud_sync.py" "$root/python_header.py"
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$root/tests" -v
grep -Fq 'SECURITY_EXCLUDES = (".env",)' "$root/nextcloud_sync.py"
grep -Fq '"--exclude", str(exclude_file)' "$root/nextcloud_sync.py"
