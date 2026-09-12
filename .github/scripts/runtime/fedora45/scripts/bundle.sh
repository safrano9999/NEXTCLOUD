#!/usr/bin/env bash
set -euo pipefail

stage="${1:?stage root required}"
source_root="${2:?source root required}"
bundle="${3:?bundle root required}"
prefix="$bundle/opt/nextcloudcmd"
runtime="$prefix/libexec/nextcloudcmd"
library_path="$stage/usr/lib64:/usr/lib64:/lib64"

mkdir -p "$prefix"/{bin,etc,lib,libexec,licenses,plugins}
install -m 0755 "$stage/usr/bin/nextcloudcmd" "$runtime"
cp -a "$stage"/usr/lib64/libnextcloudsync.so* "$prefix/lib/"
cp -a "$stage"/usr/lib64/libnextcloud_csync.so* "$prefix/lib/"

exclude="$(find "$stage" -path '*/Nextcloud/sync-exclude.lst' -print -quit)"
test -n "$exclude"
install -m 0644 "$exclude" "$prefix/etc/sync-exclude.lst"
install -m 0644 "$exclude" "$prefix/libexec/sync-exclude.lst"
install -m 0644 "$source_root/COPYING" "$prefix/licenses/COPYING"
test ! -f "$source_root/COPYING.documentation" \
  || install -m 0644 "$source_root/COPYING.documentation" "$prefix/licenses/COPYING.documentation"

declare -A copied=()
copy_dependencies() {
  local object="$1" dependency name
  while IFS= read -r dependency; do
    test -f "$dependency" || continue
    name="$(basename "$dependency")"
    case "$name" in
      ld-linux*.so*|libc.so.*|libdl.so.*|libm.so.*|libnss_*.so.*|libpthread.so.*|libresolv.so.*|librt.so.*|libutil.so.*) continue ;;
    esac
    test -z "${copied[$name]:-}" || continue
    if test -e "$prefix/lib/$name"; then
      copied[$name]=1
      continue
    fi
    install -m 0755 -T "$dependency" "$prefix/lib/$name"
    copied[$name]=1
  done < <(LD_LIBRARY_PATH="$prefix/lib:$library_path" ldd "$object" \
    | awk '/=> \// {print $3} /^[[:space:]]*\// {print $1}')
}

copy_dependencies "$runtime"
qt_plugins="$(qtpaths6 --plugin-dir)"
for category in tls sqldrivers; do
  test ! -d "$qt_plugins/$category" || cp -a "$qt_plugins/$category" "$prefix/plugins/"
done
while IFS= read -r plugin; do copy_dependencies "$plugin"; done \
  < <(find "$prefix/plugins" -type f -name '*.so' -print)

cat > "$prefix/bin/nextcloudcmd" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export LD_LIBRARY_PATH="$root/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export QT_PLUGIN_PATH="$root/plugins${QT_PLUGIN_PATH:+:$QT_PLUGIN_PATH}"
exec "$root/libexec/nextcloudcmd" "$@"
EOF
chmod 0755 "$prefix/bin/nextcloudcmd"
