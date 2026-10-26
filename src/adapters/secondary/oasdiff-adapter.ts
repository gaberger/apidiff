// Secondary adapter: oasdiff binary interaction
// Imports only from ports

import type { OasdiffPort } from "../../core/ports/index.js";
import type { SchemaCompareMode, SchemaCompareResult } from "../../core/domain/types.js";

export class OasdiffAdapter implements OasdiffPort {
  private binaryPath: string | null = null;

  async ensureInstalled(): Promise<string> {
    if (this.binaryPath) return this.binaryPath;

    // Check if oasdiff is already in PATH
    const which = Bun.spawnSync(["which", "oasdiff"]);
    if (which.exitCode === 0) {
      this.binaryPath = which.stdout.toString().trim();
      return this.binaryPath;
    }

    // Check common install locations
    const locations = ["/usr/local/bin/oasdiff", "/opt/homebrew/bin/oasdiff"];
    for (const loc of locations) {
      if (await Bun.file(loc).exists()) {
        this.binaryPath = loc;
        return this.binaryPath;
      }
    }

    throw new Error(
      "oasdiff binary not found. Install via:\n" +
        "  macOS:  brew install oasdiff\n" +
        "  Linux:  curl -fsSL https://github.com/oasdiff/oasdiff/releases/latest/download/oasdiff_linux_amd64.tar.gz | tar -xz -C /usr/local/bin",
    );
  }

  async compare(
    basePath: string,
    revisionPath: string,
    mode: SchemaCompareMode,
  ): Promise<SchemaCompareResult> {
    const binary = await this.ensureInstalled();

    // `summary` reports structure only (json/yaml, no severities), so the
    // counts always come from a text `changelog`/`breaking` run.
    const shown = await runOasdiff(binary, mode, basePath, revisionPath, mode === "summary" ? "yaml" : "text");
    const graded = mode === "summary"
      ? await runOasdiff(binary, "changelog", basePath, revisionPath, "text")
      : shown;
    const counts = countOasdiffLevels(graded.output);

    return {
      output: shown.output || shown.stderr,
      exitCode: shown.exitCode,
      mode,
      // `--fail-on ERR` makes oasdiff itself exit 1 on breaking changes. Trust
      // that over text parsing, so a future output-format change cannot make
      // `--fail-on-breaking` pass silently again.
      breakingCount: Math.max(counts.breaking, graded.exitCode === 1 ? 1 : 0),
      deprecatedCount: counts.deprecated,
      nonBreakingCount: counts.nonBreaking,
    };
  }
}

async function runOasdiff(
  binary: string,
  mode: SchemaCompareMode,
  basePath: string,
  revisionPath: string,
  format: "text" | "yaml",
): Promise<{ output: string; stderr: string; exitCode: number }> {
  const args = [binary, mode, basePath, revisionPath, "--format", format];
  if (mode !== "summary") args.push("--fail-on", "ERR");
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode > 1) {
    throw new Error(`oasdiff failed (exit ${exitCode}): ${stderr}`);
  }
  return { output, stderr, exitCode };
}

/**
 * Count oasdiff text-format entries by severity. Each entry starts with its
 * level, then a tab and the check id: `error\t[response-property-type-changed]`.
 * error = breaking; deprecations are the non-error checks whose id mentions
 * "deprecat"; everything else (warning, info) is non-breaking.
 */
export function countOasdiffLevels(text: string): { breaking: number; deprecated: number; nonBreaking: number } {
  let breaking = 0;
  let deprecated = 0;
  let nonBreaking = 0;
  for (const m of text.matchAll(/^(error|warning|info)\t\[([\w-]+)\]/gm)) {
    if (m[1] === "error") breaking++;
    else if (/deprecat/.test(m[2]!)) deprecated++;
    else nonBreaking++;
  }
  // The header ("80 changes: 12 error, 58 warning, 10 info") is the
  // authoritative error total if entry lines ever change shape.
  const header = text.match(/^\d+ changes?: (\d+) error/m);
  if (header) breaking = Math.max(breaking, Number(header[1]));
  return { breaking, deprecated, nonBreaking };
}
