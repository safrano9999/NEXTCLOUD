#!/usr/bin/env bash
set -euo pipefail

bundle="${1:?bundle root required}"
prefix="$bundle/opt/nextcloudcmd"
runtime="$prefix/libexec/nextcloudcmd"

mkdir -p "$prefix"/{bin,etc,lib,libexec,licenses,plugins}
install -m 0755 /usr/bin/nextcloudcmd "$runtime"

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
    install -m 0755 -T "$dependency" "$prefix/lib/$name"
    copied[$name]=1
  done < <(LD_LIBRARY_PATH="$prefix/lib:/usr/lib/x86_64-linux-gnu:/lib/x86_64-linux-gnu" ldd "$object" \
    | awk '/=> \// {print $3} /^[[:space:]]*\// {print $1}')
}

copy_dependencies "$runtime"
for qt_root in /usr/lib/x86_64-linux-gnu/qt5/plugins /usr/lib/x86_64-linux-gnu/qt6/plugins; do
  test -d "$qt_root" || continue
  for category in bearer iconengines imageformats platforms platformthemes sqldrivers tls; do
    test ! -d "$qt_root/$category" || cp -a "$qt_root/$category" "$prefix/plugins/"
  done
done
while IFS= read -r plugin; do copy_dependencies "$plugin"; done \
  < <(find "$prefix/plugins" -type f -name '*.so' -print)

exclude="$(find /usr/share -name sync-exclude.lst -print -quit)"
test -z "$exclude" || install -m 0644 "$exclude" "$prefix/etc/sync-exclude.lst"
install -m 0644 /usr/share/doc/nextcloud-desktop-cmd/copyright "$prefix/licenses/debian-copyright"

cat > "$prefix/bin/nextcloudcmd" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export LD_LIBRARY_PATH="$root/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export QT_PLUGIN_PATH="$root/plugins${QT_PLUGIN_PATH:+:$QT_PLUGIN_PATH}"
exec "$root/libexec/nextcloudcmd" "$@"
EOF
chmod 0755 "$prefix/bin/nextcloudcmd"
