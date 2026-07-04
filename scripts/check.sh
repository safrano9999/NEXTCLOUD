#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
node --check "$root/index.js"
PYTHONPYCACHEPREFIX="${TMPDIR:-/tmp}/nextcloud-pycache" python3 -m py_compile \
  "$root/calendar_fetch.py" "$root/nextcloud_sync.py" "$root/python_header.py"
