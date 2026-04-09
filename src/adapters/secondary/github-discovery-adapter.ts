// GitHub API discovery adapter — finds versioned OpenAPI specs in GitHub repos
// May only import from ports/ (never other adapters)

import type { ApiDiscoveryPort } from "../../core/ports/index.js";
import type { DiscoveredVersion, SpecSource } from "../../core/domain/discovery-types.js";

const SPEC_FILENAMES = ["openapi.json", "swagger.json", "api-docs.json", "openapi.yaml", "swagger.yaml"];
// Matches versioned/named spec files:
//   spec3.json, openapi2.yaml, api-v2.json, spec3.beta.sdk.json
//   api.github.com.2022-11-28.json (domain-style with date version)
const VERSIONED_FILE_RE = /^(spec|api|openapi|swagger)[\d._-].*\.(json|yaml)$/i;
// Matches product-named spec files in dedicated spec directories:
//   billing_subscriptions_v1.json, checkout_orders_v2.json
const PRODUCT_SPEC_RE = /^[a-z][a-z0-9_-]+_v\d+\.(json|yaml)$/i;
const VERSION_DIR_RE = /^(v?\d|\d{4}-\d{2})/;
// Directories likely to contain spec files even if not version-named
const SPEC_DIR_NAMES = new Set([
  "openapi", "swagger", "specs", "spec", "api", "latest", "preview",
  "descriptions", "definitions", "schemas",
]);
// Skip non-spec directories during broad exploration
const SKIP_DIRS = new Set([".github", "node_modules", "dist", "build", "test", "tests", "examples", "docs"]);

interface GitHubItem {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
}

export class GitHubDiscoveryAdapter implements ApiDiscoveryPort {
  readonly sourceKind = "github" as const;
  private readonly token?: string;

  constructor(githubToken?: string) {
    this.token = githubToken;
  }

  async discover(source: SpecSource): Promise<DiscoveredVersion[]> {
    if (source.kind !== "github") {
      throw new Error(`GitHubDiscoveryAdapter cannot handle source kind: ${source.kind}`);
    }

    const { owner, repo, path } = source;
    const branch = await this.detectBranch(owner, repo);
    const startPath = path ?? "";
    // If the starting path itself is a known spec directory, enable spec-aware matching
    const startInSpecDir = startPath !== "" && SPEC_DIR_NAMES.has(startPath.split("/").pop()!.toLowerCase());
    const specs = await this.findSpecs(owner, repo, startPath, branch, 0, startInSpecDir);

    // Deduplicate by URL
    const seen = new Set<string>();
    return specs.filter((s) => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    });
  }

  private async detectBranch(owner: string, repo: string): Promise<string> {
    const data = await this.ghGet<{ default_branch: string }>(
      `https://api.github.com/repos/${owner}/${repo}`,
    );
    return data?.default_branch ?? "main";
  }

  private async findSpecs(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    depth: number,
    insideSpecDir = false,
  ): Promise<DiscoveredVersion[]> {
    if (depth > 3) return [];

    const items = await this.listDir(owner, repo, path, branch);
    if (!items) return [];

    const results: DiscoveredVersion[] = [];
    const parentDir = path ? path.split("/").pop() : "";

    // Check files in current directory
    for (const f of items) {
      if (f.type !== "file") continue;
      const name = f.name.toLowerCase();
      if (name.startsWith("fixture") || name === "changelog.md" || name === "readme.md") continue;

      const isSpec =
        SPEC_FILENAMES.includes(name) ||
        VERSIONED_FILE_RE.test(f.name) ||
        (insideSpecDir && PRODUCT_SPEC_RE.test(f.name));

      if (isSpec) {
        const baseName = f.name.replace(/\.(json|yaml)$/i, "");
        const label = parentDir ? `${parentDir}/${baseName}` : baseName;
        results.push({
          label,
          version: baseName,
          url: f.download_url ?? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f.path}`,
        });
      }
    }

    // Deduplicate JSON vs YAML — keep JSON when both exist for same base name
    const byVersion = new Map<string, DiscoveredVersion>();
    for (const r of results) {
      const existing = byVersion.get(r.version);
      if (!existing || r.url.endsWith(".json")) {
        byVersion.set(r.version, r);
      }
    }
    results.length = 0;
    results.push(...Array.from(byVersion.values()));

    // Categorize subdirectories
    const dirs = items.filter((f) => f.type === "dir" && !SKIP_DIRS.has(f.name.toLowerCase()));
    const versionDirs = dirs.filter((f) => VERSION_DIR_RE.test(f.name));
    const specDirs = dirs.filter(
      (f) => SPEC_DIR_NAMES.has(f.name.toLowerCase()) && !versionDirs.includes(f),
    );

    // Recurse into spec-holding directories (mark as insideSpecDir)
    for (const dir of specDirs.slice(0, 5)) {
      const sub = await this.findSpecs(owner, repo, dir.path, branch, depth + 1, true);
      results.push(...sub);
    }

    // When inside a spec directory, also recurse into ALL non-skipped subdirs
    // (handles structures like descriptions/api.github.com/*.json)
    if (insideSpecDir) {
      const otherDirs = dirs.filter((f) => !specDirs.includes(f) && !versionDirs.includes(f));
      for (const dir of otherDirs.slice(0, 10)) {
        const sub = await this.findSpecs(owner, repo, dir.path, branch, depth + 1, true);
        results.push(...sub);
      }
    }

    // Recurse into version-named directories
    for (const dir of versionDirs.slice(0, 15)) {
      const sub = await this.findSpecs(owner, repo, dir.path, branch, depth + 1, insideSpecDir);
      if (sub.length > 0) {
        results.push(...sub.map((s) => ({ ...s, label: dir.name, version: dir.name })));
      } else {
        for (const specName of SPEC_FILENAMES) {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${dir.path}/${specName}`;
          const exists = await this.urlExists(rawUrl);
          if (exists) {
            results.push({ label: dir.name, url: rawUrl, version: dir.name });
            break;
          }
        }
      }
    }

    return results;
  }

  private async listDir(
    owner: string,
    repo: string,
    path: string,
    branch: string,
  ): Promise<GitHubItem[] | null> {
    return this.ghGet<GitHubItem[]>(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    );
  }

  private async ghGet<T>(url: string): Promise<T | null> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "apidiff-discovery/2.0",
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  private async urlExists(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
