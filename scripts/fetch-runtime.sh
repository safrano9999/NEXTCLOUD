#!/usr/bin/env bash
set -euo pipefail

platform="${1:?fedora64 or debian64 required}"
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

case "$platform" in
  fedora64)
    base=https://github.com/safrano9999/NEXTCLOUDCMD_FEDORA44/releases/latest/download
    archive=nextcloudcmd-fedora44-x86_64.zip
    ;;
  debian64)
    base=https://github.com/safrano9999/NEXTCLOUDCMD_DEBIAN12/releases/latest/download
    archive=nextcloudcmd-debian12-x86_64.zip
    ;;
  *) echo "Unsupported runtime: $platform" >&2; exit 2 ;;
esac

curl -fsSL "$base/$archive" -o "$tmp/$archive"
curl -fsSL "$base/$archive.sha256" -o "$tmp/$archive.sha256"
(cd "$tmp" && sha256sum -c "$archive.sha256")
rm -rf "$root/runtime"
mkdir -p "$root/runtime"
unzip -q "$tmp/$archive" -d "$root/runtime"
