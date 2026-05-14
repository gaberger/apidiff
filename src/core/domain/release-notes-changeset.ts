// Pure release-notes → API-changeset mapping. Zero external imports.
// HTML parsing + bucket extraction + changeset assembly + markdown rendering.
// IO (fetch, file-write) lives in the calling adapter (src/cli.ts).

export const BUCKET_HEADINGS = [
  "Breaking changes",
  "Scheduled breaking changes",
  "Query parameter changes",
  "New operations",
  "New models",
  "Model changes",
  "Documentation changes",
] as const;
export type BucketName = (typeof BUCKET_HEADINGS)[number];

export interface RawItem {
  readonly title: string;
  readonly description: string;
  readonly affectedOps: readonly string[];
}

export interface ParsedNotes {
  readonly releaseDate?: string;
  readonly version?: string;
  readonly buckets: ReadonlyMap<BucketName, readonly RawItem[]>;
}

export type Severity = "info" | "notice" | "breaking";

export interface ChangeEntry {
  id: string;
  op: string;
  target: string;
  from?: string | readonly string[];
  to?: string | readonly string[];
  at?: string;
  breaking?: boolean;
  severity: Severity;
  description: string;
  detectable?: boolean;
  lifecycle?: { sunset_date?: string; deprecated_date?: string; reason?: string };
  migration?: { client_action: string; automated: boolean };
}

export interface Changeset {
  changeset_version: "0.2";
  api: { name: string; from: { version: string }; to: { version: string } };
  released?: string;
  summary: string;
  changes: ChangeEntry[];
}

export interface ChangesetMeta {
  /** Source URL or path that the HTML came from — used only in `summary` and the MD report header. */
  readonly source?: string;
  readonly apiName?: string;
  readonly fromVersion?: string;
  readonly toVersion?: string;
  readonly released?: string;
}

// ─────────────────────────── parsing ───────────────────────────

export function parseHtml(html: string): ParsedNotes {
  const buckets = new Map<BucketName, RawItem[]>();
  for (const b of BUCKET_HEADINGS) buckets.set(b, []);

  const dateMatch = html.match(/Released:\s*(\d{4}-\d{2}-\d{2})/);
  const releaseDate = dateMatch?.[1];

  const versionMatch =
    html.match(/<h1[^>]*>[^<]*?(?:Release\s+)?(\d{2,4}\.\d+(?:\.\d+)?)[^<]*<\/h1>/i) ??
    html.match(/release\.?(\d{2,4}\.\d+(?:\.\d+)?)/i);
  const version = versionMatch?.[1];

  for (let i = 0; i < BUCKET_HEADINGS.length; i++) {
    const heading = BUCKET_HEADINGS[i]!;
    const next = BUCKET_HEADINGS[i + 1];
    buckets.set(heading, extractBucket(html, heading, next));
  }

  return { releaseDate, version, buckets };
}

function extractBucket(html: string, startHeading: string, endHeading: string | undefined): RawItem[] {
  const startIdx = indexOfHeading(html, startHeading);
  if (startIdx < 0) return [];
  let endIdx = endHeading ? indexOfHeading(html, endHeading, startIdx + 1) : -1;
  if (endIdx < 0) endIdx = html.length;
  const section = html.substring(startIdx, endIdx);

  const items: RawItem[] = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = liRegex.exec(section)) !== null) {
    const inner = m[1]!;
    const titleMatch = inner.match(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/i);
    const title = titleMatch ? stripTags(titleMatch[2]!).trim() : "";
    const afterTitle = titleMatch ? inner.substring(inner.indexOf(titleMatch[0]) + titleMatch[0].length) : inner;
    const description = stripTags(afterTitle).replace(/\s+/g, " ").trim();
    const affectedOps = extractAffectedOps(inner);
    if (title || description) items.push({ title, description, affectedOps });
  }
  return items;
}

function indexOfHeading(html: string, heading: string, fromIdx = 0): number {
  const re = new RegExp(`>\\s*${escapeRegex(heading)}\\s*<`, "i");
  const slice = html.substring(fromIdx);
  const m = slice.match(re);
  if (m && m.index !== undefined) return fromIdx + m.index;
  return html.indexOf(heading, fromIdx);
}

function extractAffectedOps(html: string): string[] {
  const ops: string[] = [];
  const re = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[A-Za-z0-9_\-{}\/]+)/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html)) !== null) {
    const sig = `${m[1]} ${m[2]}`;
    if (!seen.has(sig)) { seen.add(sig); ops.push(sig); }
  }
  return ops;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─────────────── release-notes → changeset mapping ───────────────

const BUCKET_TO_MAPPING: Record<BucketName, {
  op: string;
  target: string;
  severity: Severity;
  breaking?: boolean;
  detectable?: boolean;
  asAt?: boolean;
  asTo?: boolean;
  asFrom?: boolean;
}> = {
  "Breaking changes":           { op: "constrain", target: "schema-field",   severity: "breaking", breaking: true,  detectable: true,  asAt: true },
  "Scheduled breaking changes": { op: "deprecate", target: "schema-field",   severity: "notice",   breaking: false, detectable: true,  asAt: true },
  "Query parameter changes":    { op: "constrain", target: "query-parameter",severity: "notice",   detectable: true,  asAt: true },
  "New operations":             { op: "add",       target: "operation",      severity: "notice",   detectable: true,  asTo: true },
  "New models":                 { op: "add",       target: "schema",         severity: "info",     detectable: true,  asTo: true },
  "Model changes":              { op: "constrain", target: "schema",         severity: "notice",   detectable: true,  asAt: true },
  "Documentation changes":      { op: "annotate",  target: "schema",         severity: "info",     detectable: false, asAt: true },
};

const SAFE_POINTER_FALLBACK = "#";

function opsToPointers(ops: readonly string[]): string[] {
  return ops.map((op) => {
    const [verb, path] = op.split(" ");
    if (!verb || !path) return SAFE_POINTER_FALLBACK;
    const escaped = path.replace(/~/g, "~0").replace(/\//g, "~1");
    return `#/paths/${escaped}/${verb.toLowerCase()}`;
  });
}

function buildChanges(parsed: ParsedNotes): ChangeEntry[] {
  const changes: ChangeEntry[] = [];
  let counter = 1;
  for (const [bucket, items] of parsed.buckets) {
    const mapping = BUCKET_TO_MAPPING[bucket];
    if (!mapping) continue;
    for (const item of items) {
      const id = `CHG-${String(counter).padStart(3, "0")}`;
      counter++;
      const pointers = item.affectedOps.length > 0 ? opsToPointers(item.affectedOps) : [SAFE_POINTER_FALLBACK];
      const ptr: string | string[] = pointers.length === 1 ? pointers[0]! : pointers;
      const entry: ChangeEntry = {
        id,
        op: mapping.op,
        target: mapping.target,
        severity: mapping.severity,
        description: [item.title, item.description].filter(Boolean).join(" — ") || "(no description)",
      };
      if (mapping.breaking !== undefined) entry.breaking = mapping.breaking;
      if (mapping.detectable !== undefined) entry.detectable = mapping.detectable;
      if (mapping.asAt) entry.at = Array.isArray(ptr) ? ptr[0]! : ptr;
      if (mapping.asTo) entry.to = ptr;
      if (mapping.asFrom) entry.from = ptr;
      if (mapping.op === "deprecate") {
        entry.lifecycle = { reason: item.title || "Scheduled breaking change announced in release notes." };
      }
      if (entry.severity === "breaking" || entry.breaking === true) {
        entry.migration = {
          client_action: item.description || item.title || "See release notes for migration guidance.",
          automated: false,
        };
      }
      changes.push(entry);
    }
  }
  return changes;
}

export function buildChangeset(parsed: ParsedNotes, meta: ChangesetMeta): Changeset {
  const inferredVersion = parsed.version ?? meta.toVersion ?? "unknown";
  const apiName = meta.apiName ?? inferApiNameFromUrl(meta.source) ?? "Unknown API";
  const cs: Changeset = {
    changeset_version: "0.2",
    api: {
      name: apiName,
      from: { version: meta.fromVersion ?? "previous" },
      to:   { version: meta.toVersion ?? inferredVersion },
    },
    summary: `Auto-generated from release notes${meta.source ? ` at ${meta.source}` : ""}.`,
    changes: buildChanges(parsed),
  };
  const released = meta.released ?? parsed.releaseDate;
  if (released) cs.released = released;
  return cs;
}

export function inferApiNameFromUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const host = new URL(u).hostname;
    if (host.includes("fwd.app")) return "Forward Networks API";
    if (host.includes("stripe")) return "Stripe API";
    if (host.includes("github")) return "GitHub REST API";
    return host;
  } catch {
    return undefined;
  }
}

// ─────────────────────────── markdown report ───────────────────────────

export function renderMarkdown(parsed: ParsedNotes, cs: Changeset, source?: string): string {
  const lines: string[] = [];
  lines.push(`# Release-notes report: ${cs.api.name} ${cs.api.to.version}`);
  if (cs.released) lines.push(`\n_Released: ${cs.released}_`);
  if (source) lines.push(`\n_Source: ${source}_\n`); else lines.push("");

  const totals = {
    breaking: cs.changes.filter((c) => c.severity === "breaking" && c.breaking).length,
    deprecations: cs.changes.filter((c) => c.op === "deprecate").length,
    notice: cs.changes.filter((c) => c.severity === "notice").length,
    info: cs.changes.filter((c) => c.severity === "info").length,
    total: cs.changes.length,
  };
  lines.push(`## Summary`);
  lines.push(`| Severity | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| breaking (immediate) | ${totals.breaking} |`);
  lines.push(`| deprecations (scheduled break) | ${totals.deprecations} |`);
  lines.push(`| notice | ${totals.notice} |`);
  lines.push(`| info | ${totals.info} |`);
  lines.push(`| **total** | **${totals.total}** |\n`);

  for (const bucket of BUCKET_HEADINGS) {
    const items = parsed.buckets.get(bucket) ?? [];
    if (items.length === 0) continue;
    lines.push(`## ${bucket} (${items.length})`);
    for (const it of items) {
      const t = it.title || "(no title)";
      lines.push(`- **${t}**${it.description ? ` — ${truncate(it.description, 240)}` : ""}`);
      if (it.affectedOps.length > 0) {
        for (const op of it.affectedOps) lines.push(`  - \`${op}\``);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
