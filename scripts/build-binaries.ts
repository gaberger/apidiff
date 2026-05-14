#!/usr/bin/env bun
// build-binaries.ts
//
// Cross-compile src/cli.ts (the unified apidiff CLI: diff/guide/schema/report)
// into single-file binaries for Linux / macOS / Windows using
// `bun build --compile`. Each binary embeds the Bun runtime, so end-users do
// not need Bun (or Node) installed.
//
// Usage:
//   bun scripts/build-binaries.ts              # build all targets → ./dist
//   bun scripts/build-binaries.ts current      # current host only
//   bun scripts/build-binaries.ts linux-x64 darwin-arm64  # subset
//
// Output naming: dist/apidiff-<os>-<arch>[.exe]

import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

interface Target {
  /** short id used on the cli + output filename */
  id: string;
  /** value passed to `bun build --target` */
  bunTarget: string;
  /** appended to the output filename (e.g. ".exe" on Windows) */
  ext: string;
}

const TARGETS: Target[] = [
  { id: "linux-x64",     bunTarget: "bun-linux-x64",     ext: "" },
  { id: "linux-arm64",   bunTarget: "bun-linux-arm64",   ext: "" },
  { id: "darwin-x64",    bunTarget: "bun-darwin-x64",    ext: "" },
  { id: "darwin-arm64",  bunTarget: "bun-darwin-arm64",  ext: "" },
  { id: "windows-x64",   bunTarget: "bun-windows-x64",   ext: ".exe" },
];

const ENTRY = resolve(import.meta.dir, "..", "src", "cli.ts");
const OUT_DIR = resolve(import.meta.dir, "..", "dist");
const BIN_NAME = "apidiff";

function pickTargets(argv: string[]): Target[] {
  if (argv.length === 0) return TARGETS;
  if (argv[0] === "current") {
    const os = process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : "linux";
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const id = `${os}-${arch}`;
    const t = TARGETS.find((x) => x.id === id);
    if (!t) throw new Error(`No prebuilt target for current host ${id}`);
    return [t];
  }
  return argv.map((id) => {
    const t = TARGETS.find((x) => x.id === id);
    if (!t) throw new Error(`Unknown target '${id}'. Known: ${TARGETS.map((x) => x.id).join(", ")}`);
    return t;
  });
}

function buildOne(t: Target) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const outFile = resolve(OUT_DIR, `${BIN_NAME}-${t.id}${t.ext}`);
  console.error(`→ ${t.id} → ${outFile}`);
  const res = spawnSync(
    process.execPath, // bun itself
    [
      "build",
      "--compile",
      `--target=${t.bunTarget}`,
      "--minify",
      "--outfile",
      outFile,
      ENTRY,
    ],
    { stdio: "inherit" },
  );
  if (res.status !== 0) throw new Error(`bun build failed for ${t.id} (exit ${res.status})`);
}

const targets = pickTargets(process.argv.slice(2));
console.error(`Building ${targets.length} target(s) → ${OUT_DIR}\n`);
for (const t of targets) buildOne(t);
console.error(`\n✓ Done. Binaries in ${OUT_DIR}/`);
