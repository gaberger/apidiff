// How to install apidiff: the one place the site gets it from.
// tests/unit/install-docs.test.ts checks that README.md, install.sh and
// scripts/build-binaries.ts agree with these values.
import pkg from "../../../package.json";

export const REPO_URL = "https://github.com/gaberger/apidiff";
export const INSTALL_URL = "https://apidiff.app/install.sh";
export const LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`;

/** The release the version-pinning example points at: always the current one. */
export const CURRENT_TAG = `v${pkg.version}`;

export const INSTALL_CMD = `curl -fsSL ${INSTALL_URL} | sh`;
export const PIN_CMD = `curl -fsSL ${INSTALL_URL} | sh -s -- --version ${CURRENT_TAG}`;
export const DIR_CMD = `curl -fsSL ${INSTALL_URL} | sudo sh -s -- --dir /usr/local/bin`;
export const DEFAULT_DIR = "~/.local/bin";

/** Release files, one per platform. Must match scripts/build-binaries.ts. */
export const ASSETS = [
  { platform: "macOS, Apple Silicon", file: "apidiff-darwin-arm64" },
  { platform: "macOS, Intel", file: "apidiff-darwin-x64" },
  { platform: "Linux x64", file: "apidiff-linux-x64" },
  { platform: "Linux arm64", file: "apidiff-linux-arm64" },
  { platform: "Windows x64", file: "apidiff-windows-x64.exe" },
];
