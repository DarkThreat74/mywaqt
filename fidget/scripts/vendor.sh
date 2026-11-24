#!/usr/bin/env bash
# Re-vendor the toy elements from their source repos into public/toys/.
# vendor-src/<repo> must already contain a clone of each UI repo.
# Copies each piece's element JS + its sibling asset dirs (art/, audio/,
# sounds/, fonts/) which the elements resolve via import.meta.url —
# those relative paths must survive verbatim. Build sources (src/) and
# nested duplicate dirs are dropped.
set -euo pipefail
cd "$(dirname "$0")/.."

for world in vendor-src/*/; do
  name="$(basename "$world")"
  find "$world" -mindepth 2 -maxdepth 2 -name "*.js" -path "*/elements/*" 2>/dev/null | while read -r el; do
    piece_dir="$(dirname "$el")"
    piece="$(basename "$piece_dir")"
    dest="public/toys/$name/$piece"
    mkdir -p "$dest"
    cp -r "$piece_dir/." "$dest/"
  done
  # flat repos (no elements/ subdir): piece dirs sit at top level
  find "$world" -mindepth 1 -maxdepth 1 -type d ! -name ".*" ! -name "src" ! -name "node_modules" | while read -r piece_dir; do
    piece="$(basename "$piece_dir")"
    [ -d "public/toys/$name/$piece" ] && continue
    grep -l "customElements.define" "$piece_dir"/*.js >/dev/null 2>&1 || continue
    dest="public/toys/$name/$piece"
    mkdir -p "$dest"
    cp -r "$piece_dir/." "$dest/"
  done
done

# drop build sources and accidental nested copies
find public/toys -type d -name src -exec rm -rf {} + 2>/dev/null || true
find public/toys -mindepth 3 -maxdepth 3 -type d | while read -r d; do
  [ "$(basename "$d")" = "$(basename "$(dirname "$d")")" ] && rm -rf "$d"
done
echo "vendored: $(find public/toys -name '*.js' | wc -l) element files"
