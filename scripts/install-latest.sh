#!/usr/bin/env bash
# install-latest.sh
#
# 1. If a "Release binaries" workflow is currently in-flight, watch it to
#    completion (so the latest tag's assets are guaranteed to exist).
# 2. Download the binary matching this host's OS/arch from the most-recent
#    GitHub Release and install it to ~/.local/bin/apidiff.
# 3. Print one line confirming the install + version.
#
# Idempotent. Safe to re-run.
#
# Usage:
#   bash scripts/install-latest.sh
#   bash scripts/install-latest.sh --dest /usr/local/bin   # custom install dir
#   bash scripts/install-latest.sh --tag v0.2.0            # pin a specific tag

set -euo pipefail

DEST_DIR="$HOME/.local/bin"
TAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest) DEST_DIR="$2"; shift 2 ;;
    --tag)  TAG="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

# --- detect host platform ---
os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch_raw="$(uname -m)"
case "$arch_raw" in
  x86_64|amd64) arch="x64" ;;
  aarch64|arm64) arch="arm64" ;;
  *) echo "unsupported arch: $arch_raw" >&2; exit 1 ;;
esac
case "$os" in
  linux|darwin) ;;
  *) echo "unsupported os: $os (run install manually on Windows)" >&2; exit 1 ;;
esac
asset="apidiff-${os}-${arch}"

# --- 1. wait out any in-flight release workflow ---
in_flight="$(gh run list --workflow="Release binaries" --status=in_progress --limit=1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
if [[ -z "$in_flight" ]]; then
  # Also catch queued runs.
  in_flight="$(gh run list --workflow="Release binaries" --status=queued --limit=1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
fi
if [[ -n "$in_flight" ]]; then
  echo "→ watching in-flight release workflow $in_flight"
  gh run watch "$in_flight" --exit-status >/dev/null
  echo "  workflow completed"
fi

# --- 2. install the asset ---
mkdir -p "$DEST_DIR"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

if [[ -n "$TAG" ]]; then
  echo "→ downloading $asset from tag $TAG"
  gh release download "$TAG" --pattern "$asset" -O "$tmp" --clobber
else
  echo "→ downloading $asset from latest release"
  gh release download --pattern "$asset" -O "$tmp" --clobber
fi

install -m 755 "$tmp" "$DEST_DIR/apidiff"

# --- 3. verify ---
out="$("$DEST_DIR/apidiff" 2>&1)"
title="$(printf '%s\n' "$out" | grep -m1 'apidiff' | sed 's/^[[:space:]]*//')"
size="$(stat -c %s "$DEST_DIR/apidiff" 2>/dev/null || stat -f %z "$DEST_DIR/apidiff")"
size_mb="$(( size / 1024 / 1024 ))"
echo "✓ installed: $DEST_DIR/apidiff  (${size_mb} MB)"
echo "  ${title:-(no banner — binary may be corrupted)}"
