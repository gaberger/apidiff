#!/bin/sh
# install.sh — install the apidiff command line tool.
#
#   curl -fsSL https://apidiff.app/install.sh | sh
#   curl -fsSL https://apidiff.app/install.sh | sh -s -- --version v0.3.0
#   curl -fsSL https://apidiff.app/install.sh | sudo sh -s -- --dir /usr/local/bin
#
# Options (or environment variables):
#   --version <tag>   APIDIFF_VERSION       Release to install. Default: latest.
#   --dir <path>      APIDIFF_INSTALL_DIR   Where to put the binary. Default: ~/.local/bin
#   --base-url <url>  APIDIFF_BASE_URL      Download from a mirror instead of GitHub.
#                                           Files must be at <url>/<tag>/<asset>.
#
# Downloads the binary for this OS and CPU from GitHub Releases, checks it
# against the release's SHA256SUMS, and installs it. Needs only curl and sh.

set -eu

REPO="gaberger/apidiff"

# Everything runs inside main, so a partly downloaded script does nothing.
main() {
  version="${APIDIFF_VERSION:-latest}"
  install_dir="${APIDIFF_INSTALL_DIR:-$HOME/.local/bin}"
  base_url="${APIDIFF_BASE_URL:-}"

  while [ $# -gt 0 ]; do
    case "$1" in
      --version) version="${2:?--version needs a tag, e.g. v0.3.0}"; shift 2 ;;
      --dir) install_dir="${2:?--dir needs a path}"; shift 2 ;;
      --base-url) base_url="${2:?--base-url needs a URL}"; shift 2 ;;
      -h|--help) sed -n '2,15p' "$0" 2>/dev/null || echo "see https://apidiff.app/tools"; exit 0 ;;
      *) fail "unknown option: $1 (try --help)" ;;
    esac
  done

  # Check the platform first, so an unsupported system fails before anything else.
  asset="apidiff-$(detect_platform)"

  command -v curl >/dev/null 2>&1 || fail "curl is required"

  if [ -n "$base_url" ]; then
    url="${base_url%/}/$version"
  elif [ "$version" = "latest" ]; then
    url="https://github.com/$REPO/releases/latest/download"
  else
    case "$version" in v*) ;; *) version="v$version" ;; esac
    url="https://github.com/$REPO/releases/download/$version"
  fi

  mkdir -p "$install_dir" || fail "cannot create $install_dir"
  # Download next to the destination so the final step is a rename. Copying
  # over a running or signed binary can get it killed on macOS.
  tmp="$(mktemp "$install_dir/.apidiff.XXXXXX")" || fail "cannot write to $install_dir"
  sums="$(mktemp)"
  trap 'rm -f "$tmp" "$sums"' EXIT INT TERM

  say "Downloading $asset ($version)"
  download "$url/$asset" "$tmp" ||
    fail "download failed: $url/$asset
       Check that release $version exists: https://github.com/$REPO/releases"

  if download "$url/SHA256SUMS" "$sums" 2>/dev/null; then
    verify_checksum "$tmp" "$sums" "$asset"
  else
    warn "no SHA256SUMS in this release; skipping the checksum check"
  fi

  chmod 755 "$tmp"
  mv -f "$tmp" "$install_dir/apidiff"
  trap 'rm -f "$sums"' EXIT INT TERM

  "$install_dir/apidiff" >/dev/null 2>&1 ||
    fail "installed $install_dir/apidiff, but it does not run on this machine"

  say "Installed $install_dir/apidiff"
  path_hint "$install_dir"
  command -v oasdiff >/dev/null 2>&1 ||
    say "Optional: 'apidiff schema' also needs oasdiff (https://github.com/oasdiff/oasdiff)"
  say "Run 'apidiff' to get started, or see https://apidiff.app/tools"
}

detect_platform() {
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin) os="darwin" ;;
    Linux)
      os="linux"
      # The binaries link against glibc; musl systems such as Alpine can't run them.
      if [ -f /etc/alpine-release ] || ldd --version 2>&1 | grep -qi musl; then
        fail "musl-based Linux (e.g. Alpine) is not supported; use a glibc image or build from source"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      fail "on Windows, download apidiff-windows-x64.exe from https://github.com/$REPO/releases/latest" ;;
    *) fail "unsupported OS: $os" ;;
  esac
  case "$arch" in
    x86_64|amd64)
      arch="x64"
      # A Rosetta shell on Apple Silicon reports x86_64; the native build is faster.
      if [ "$os" = "darwin" ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then
        arch="arm64"
      fi
      ;;
    arm64|aarch64) arch="arm64" ;;
    *) fail "unsupported CPU: $arch" ;;
  esac
  echo "$os-$arch"
}

download() {
  curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 \
    --output "$2" "$1"
}

verify_checksum() {
  file="$1"; sums="$2"; name="$3"
  expected="$(awk -v n="$name" '$2 == n || $2 == "*" n { print $1 }' "$sums")"
  [ -n "$expected" ] || fail "$name is not listed in SHA256SUMS"
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$file" | awk '{ print $1 }')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$file" | awk '{ print $1 }')"
  else
    warn "no sha256sum or shasum found; skipping the checksum check"
    return 0
  fi
  [ "$actual" = "$expected" ] ||
    fail "checksum mismatch for $name
       expected $expected
       got      $actual
       The download may be corrupt or tampered with. Nothing was installed."
  say "Checksum OK"
}

path_hint() {
  case ":$PATH:" in
    *":$1:"*) return 0 ;;
  esac
  case "${SHELL:-}" in
    */zsh) rc="~/.zshrc" ;;
    */bash) rc="~/.bashrc" ;;
    */fish) say "$1 is not on your PATH. Run: fish_add_path $1"; return 0 ;;
    *) rc="your shell's startup file" ;;
  esac
  say "$1 is not on your PATH. Add this line to $rc:"
  say "  export PATH=\"$1:\$PATH\""
}

say() { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

main "$@"
