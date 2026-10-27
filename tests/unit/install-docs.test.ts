// Keeps the install instructions in sync everywhere they appear: the site
// (src/components/site/install.js), README.md, install.sh, and the release
// files scripts/build-binaries.ts produces. A version bump or a renamed
// asset that misses one of them fails here.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  ASSETS,
  CURRENT_TAG,
  DEFAULT_DIR,
  DIR_CMD,
  INSTALL_CMD,
  INSTALL_URL,
  PIN_CMD,
  REPO_URL,
} from "../../src/components/site/install.js";

const ROOT = join(import.meta.dir, "..", "..");
const read = (p: string) => Bun.file(join(ROOT, p)).text();

const readme = await read("README.md");
const installSh = await read("install.sh");
const buildBinaries = await read("scripts/build-binaries.ts");
const pkg = JSON.parse(await read("package.json"));

describe("install instructions stay in sync", () => {
  test("the pinned version is the current release", () => {
    expect(CURRENT_TAG).toBe(`v${pkg.version}`);
  });

  test("README shows the same commands as the site", () => {
    for (const cmd of [INSTALL_CMD, PIN_CMD, DIR_CMD]) expect(readme).toContain(cmd);
    expect(readme).toContain(`installs it to \`${DEFAULT_DIR}\``);
  });

  test("install.sh documents the same commands and default folder", () => {
    for (const cmd of [INSTALL_CMD, PIN_CMD, DIR_CMD]) expect(installSh).toContain(`#   ${cmd}`);
    expect(installSh).toContain(`Default: ${DEFAULT_DIR}`);
    expect(installSh).toContain(`APIDIFF_INSTALL_DIR:-$HOME/${DEFAULT_DIR.replace(/^~\//, "")}`);
  });

  test("install.sh downloads from the same repository", () => {
    expect(installSh).toContain(`REPO="${REPO_URL.replace("https://github.com/", "")}"`);
  });

  test("the site serves install.sh at the advertised URL", () => {
    expect(INSTALL_URL).toBe("https://apidiff.app/install.sh");
    expect(pkg.scripts["build:site"]).toContain("cp install.sh site-dist/install.sh");
  });

  test("README lists the same release files, in the same order", () => {
    const rows = [...readme.matchAll(/^\| ([^|]+?) \| `(apidiff-[^`]+)` \|$/gm)].map((m) => ({
      platform: m[1]!,
      file: m[2]!,
    }));
    expect(rows).toEqual(ASSETS);
  });

  test("the release build produces exactly those files", () => {
    const built = [...buildBinaries.matchAll(/\{\s*id:\s*"([\w-]+)",[^}]*ext:\s*"([^"]*)"\s*\}/g)]
      .map((m) => `apidiff-${m[1]}${m[2]}`)
      .sort();
    expect(built).toEqual(ASSETS.map((a) => a.file).sort());
  });

  test("install.sh can name every non-Windows release file", () => {
    // detect_platform() returns "<os>-<arch>" from these values.
    for (const { file } of ASSETS.filter((a) => !a.file.endsWith(".exe"))) {
      const [, os, arch] = file.match(/^apidiff-(\w+)-(\w+)$/)!;
      expect(installSh).toContain(`os="${os}"`);
      expect(installSh).toContain(`arch="${arch}"`);
    }
    expect(installSh).toContain("apidiff-windows-x64.exe");
  });
});
