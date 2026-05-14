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

  // Walk EVERY heading on the page. A bucket section ends at the *next*
  // heading of any kind, regardless of whether that next heading is also
  // a recognized bucket name. This fixes the bug where a missing
  // intermediate bucket caused one section to swallow the next.
  const headingRe = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  type HeadingHit = { text: string; start: number; end: number };
  const headings: HeadingHit[] = [];
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(html)) !== null) {
    const text = stripTags(hm[1]!).trim();
    if (text) headings.push({ text, start: hm.index, end: hm.index + hm[0].length });
  }

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;
    if (!isBucketName(h.text)) continue;
    const sectionStart = h.end;
    const sectionEnd = headings[i + 1]?.start ?? html.length;
    const section = html.substring(sectionStart, sectionEnd);
    const items = extractTopLevelLi(section).map(parseItem).filter(hasContent);
    // A bucket may appear more than once (e.g. ToC repeats). Merge, dedupe.
    const existing = buckets.get(h.text as BucketName) ?? [];
    buckets.set(h.text as BucketName, dedupeItems([...existing, ...items]));
  }

  return { releaseDate, version, buckets };
}

function isBucketName(s: string): s is BucketName {
  return (BUCKET_HEADINGS as readonly string[]).includes(s);
}

/**
 * Top-level `<li>` only — nested `<li>` (e.g. inside an "Affected operations"
 * sublist) stay inside their parent and are picked up via {@link extractAffectedOps}.
 */
function extractTopLevelLi(html: string): string[] {
  const out: string[] = [];
  const tagRe = /<(\/?)li\b[^>]*>/gi;
  let depth = 0;
  let captureStart = -1;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const isClose = m[1] === "/";
    if (!isClose) {
      if (depth === 0) captureStart = m.index + m[0].length;
      depth++;
    } else {
      depth--;
      if (depth === 0 && captureStart >= 0) {
        out.push(html.substring(captureStart, m.index));
        captureStart = -1;
      }
    }
  }
  return out;
}

function parseItem(innerHtml: string): RawItem {
  const titleMatch = innerHtml.match(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/i);
  const title = titleMatch ? stripTags(titleMatch[2]!).trim() : "";

  // Description = text between the title and the first nested <ul>/<ol>.
  // Anything below that is the "Affected operations" sublist and gets folded
  // into affectedOps via extractAffectedOps over the whole inner block.
  const sublistIdx = innerHtml.search(/<(ul|ol)\b/i);
  const descRegion = sublistIdx >= 0 ? innerHtml.substring(0, sublistIdx) : innerHtml;
  const descAfterTitle = titleMatch
    ? descRegion.substring(descRegion.indexOf(titleMatch[0]) + titleMatch[0].length)
    : descRegion;
  let description = stripTags(descAfterTitle).replace(/\s+/g, " ").trim();
  // Strip a redundant "Affected operations: ..." trailer if it's all that's left.
  description = description.replace(/^Affected operations:\s*(none\.?)?$/i, "").trim();

  const affectedOps = extractAffectedOps(innerHtml);
  return { title, description, affectedOps };
}

function hasContent(it: RawItem): boolean {
  // Drop entirely-empty items and ones whose entire payload is a single op
  // signature (those are nested-li artifacts the new walker should never
  // produce — belt + braces).
  if (!it.title && !it.description && it.affectedOps.length === 0) return false;
  if (!it.title && !it.description && it.affectedOps.length <= 1) return false;
  if (!it.title) {
    // A no-title item with affectedOps is real iff it has a description too.
    return it.description.length > 0;
  }
  return true;
}

function dedupeItems(items: RawItem[]): RawItem[] {
  const seen = new Map<string, RawItem>();
  for (const it of items) {
    const key = `${it.title}${it.description}`;
    const prior = seen.get(key);
    if (!prior) { seen.set(key, it); continue; }
    // Merge affectedOps so we don't lose data from a second sighting.
    const ops = new Set([...prior.affectedOps, ...it.affectedOps]);
    seen.set(key, { ...prior, affectedOps: [...ops] });
  }
  return [...seen.values()];
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
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // Strip invisible/format chars that survive .trim() — Docusaurus anchor
    // links inject U+200B (zero-width space) inside headings.
    .replace(/[​-‍﻿]/g, "")
    // Collapse runs of whitespace to one space, then trim outer.
    .replace(/\s+/g, " ")
    .trim();
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

export interface RenderOptions {
  /** ANSI escape codes for terminals. Caller sets this to `process.stdout.isTTY`. */
  readonly color?: boolean;
  /** Long form: full per-item breakdown. Default false. */
  readonly verbose?: boolean;
  /** Source URL/path, shown in header. */
  readonly source?: string;
  /** Max items per bucket when not verbose. Default 5. */
  readonly previewLimit?: number;
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

export function renderMarkdown(parsed: ParsedNotes, cs: Changeset, opts: RenderOptions = {}): string {
  const color = opts.color === true;
  const verbose = opts.verbose === true;
  const limit = opts.previewLimit ?? 5;
  const c = (code: string, s: string) => (color ? `${code}${s}${ANSI.reset}` : s);

  const totals = {
    breaking: cs.changes.filter((x) => x.severity === "breaking" && x.breaking).length,
    deprecations: cs.changes.filter((x) => x.op === "deprecate").length,
    notice: cs.changes.filter((x) => x.severity === "notice").length,
    info: cs.changes.filter((x) => x.severity === "info").length,
    total: cs.changes.length,
  };

  const out: string[] = [];
  out.push("");
  out.push(c(ANSI.bold, `${cs.api.name}  ${cs.api.to.version}`));
  if (cs.released) out.push(c(ANSI.dim, `released ${cs.released}`));
  if (opts.source) out.push(c(ANSI.dim, opts.source));
  out.push("");

  // Summary box — fixed-width counts.
  const rows: Array<[string, number, string]> = [
    ["breaking",     totals.breaking,     ANSI.red],
    ["deprecations", totals.deprecations, ANSI.yellow],
    ["notice",       totals.notice,       ANSI.blue],
    ["info",         totals.info,         ANSI.gray],
    ["total",        totals.total,        ANSI.bold],
  ];
  const labelW = Math.max(...rows.map((r) => r[0].length));
  for (const [label, count, code] of rows) {
    const bar = renderBar(count, totals.total, color);
    out.push(`  ${c(code, label.padEnd(labelW))}  ${c(ANSI.bold, String(count).padStart(4))}  ${c(ANSI.dim, bar)}`);
  }
  out.push("");

  // Per-bucket counts, with up-to-`limit` preview items unless verbose.
  for (const bucket of BUCKET_HEADINGS) {
    const items = parsed.buckets.get(bucket) ?? [];
    if (items.length === 0) continue;
    out.push(c(ANSI.bold, bucket) + c(ANSI.dim, `  (${items.length})`));
    const show = verbose ? items : items.slice(0, limit);
    for (const it of show) {
      const title = it.title || firstSentence(it.description) || "(no description)";
      const titleLine = `  • ${c(ANSI.cyan, title)}`;
      out.push(titleLine);
      if (it.title && it.description && verbose) {
        for (const line of wrap(it.description, 96)) out.push(`      ${c(ANSI.dim, line)}`);
      }
      if (it.affectedOps.length > 0 && verbose) {
        for (const op of it.affectedOps) out.push(`      ${c(ANSI.gray, op)}`);
      } else if (it.affectedOps.length > 0) {
        const sig = it.affectedOps.length === 1
          ? it.affectedOps[0]!
          : `${it.affectedOps[0]}  +${it.affectedOps.length - 1} more`;
        out.push(`      ${c(ANSI.gray, sig)}`);
      }
    }
    if (!verbose && items.length > limit) {
      out.push(c(ANSI.dim, `      … ${items.length - limit} more (use --verbose)`));
    }
    out.push("");
  }

  return out.join("\n");
}

function renderBar(count: number, total: number, color: boolean): string {
  if (total <= 0) return "";
  const width = 24;
  const filled = Math.round((count / total) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return color ? bar : `[${"#".repeat(filled)}${".".repeat(width - filled)}]`;
}

function firstSentence(s: string): string {
  const m = s.match(/^([^.!?]{1,120}[.!?])/);
  return m ? m[1]!.trim() : s.slice(0, 96).trim();
}

function wrap(s: string, n: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > n) { lines.push(line.trim()); line = w; }
    else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}
