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
  "Non-breaking changes",
  "Specification changes",
  "Documentation changes",
  "Notable changes to unpublished APIs",
  // Catch-all for h2 sections no rule recognizes. Never silently drop items.
  "Unclassified",
] as const;
export type BucketName = (typeof BUCKET_HEADINGS)[number];

/** Known renames of a bucket heading. Keys are normalized (see {@link normalizeHeading}). */
const HEADING_ALIASES: ReadonlyMap<string, BucketName> = new Map([
  ["deprecations", "Scheduled breaking changes"],
]);

/** Sections that are prose guides, not change lists. Their `<li>` items are steps, not changes. */
const IGNORED_HEADINGS: readonly RegExp[] = [/^appendix\b/i, /^on this page$/i];

/** Fuzzy match tolerates plurals, case and typos only. A larger distance starts matching different words. */
const MAX_HEADING_DISTANCE = 2;

export interface RawItem {
  readonly title: string;
  readonly description: string;
  readonly affectedOps: readonly string[];
}

export interface HeadingMatch {
  /** Heading text exactly as it appears on the page. */
  readonly heading: string;
  readonly bucket: BucketName;
  readonly via: "alias" | "fuzzy" | "unclassified";
  readonly itemCount: number;
}

export interface ParsedNotes {
  readonly releaseDate?: string;
  readonly version?: string;
  readonly buckets: ReadonlyMap<BucketName, readonly RawItem[]>;
  /** Headings that did not match a bucket exactly. The caller should surface these. */
  readonly inexactHeadings: readonly HeadingMatch[];
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
  related?: string[];
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
  const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  type HeadingHit = { text: string; level: number; start: number; end: number };
  const headings: HeadingHit[] = [];
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(html)) !== null) {
    const text = stripTags(hm[2]!).trim();
    if (text) headings.push({ text, level: Number(hm[1]), start: hm.index, end: hm.index + hm[0].length });
  }

  const inexact = new Map<string, HeadingMatch>();
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;
    const resolved = resolveHeading(h.text);
    if (resolved === "ignore") continue;
    // Only h2 sections become Unclassified: h1 is the page title, h3+ are sub-headings.
    if (resolved === null && h.level !== 2) continue;
    const sectionStart = h.end;
    const sectionEnd = headings[i + 1]?.start ?? html.length;
    const section = html.substring(sectionStart, sectionEnd);
    const items = extractTopLevelLi(section).flatMap(parseItems).filter(hasContent);
    if (resolved === null && items.length === 0) continue;
    const bucket = resolved?.bucket ?? "Unclassified";
    const via = resolved?.via ?? "unclassified";
    if (via !== "exact") {
      const prior = inexact.get(h.text);
      inexact.set(h.text, { heading: h.text, bucket, via, itemCount: (prior?.itemCount ?? 0) + items.length });
    }
    // A bucket may appear more than once (e.g. ToC repeats). Merge, dedupe.
    const existing = buckets.get(bucket) ?? [];
    buckets.set(bucket, dedupeItems([...existing, ...items]));
  }

  return { releaseDate, version, buckets, inexactHeadings: [...inexact.values()] };
}

type Resolution = { bucket: BucketName; via: "exact" | "alias" | "fuzzy" } | "ignore" | null;

/**
 * Map a page heading to a bucket: exact name, then alias, then a small fuzzy
 * match. Returns "ignore" for prose sections and null when nothing fits.
 */
export function resolveHeading(text: string): Resolution {
  const exact = BUCKET_HEADINGS.find((b) => b === text);
  if (exact && exact !== "Unclassified") return { bucket: exact, via: "exact" };
  if (IGNORED_HEADINGS.some((re) => re.test(text))) return "ignore";

  const norm = normalizeHeading(text);
  const alias = HEADING_ALIASES.get(norm);
  if (alias) return { bucket: alias, via: "alias" };

  let best: BucketName | null = null;
  let bestDist = Infinity;
  let tie = false;
  for (const b of BUCKET_HEADINGS) {
    if (b === "Unclassified") continue;
    const cand = normalizeHeading(b);
    // "Non-breaking changes" is 4 edits from "Breaking changes" but means the
    // opposite. Never fuzzy-match across a negation.
    if (isNegated(norm) !== isNegated(cand)) continue;
    const d = levenshtein(norm, cand);
    if (d < bestDist) { best = b; bestDist = d; tie = false; }
    else if (d === bestDist) tie = true;
  }
  if (best && bestDist <= MAX_HEADING_DISTANCE && !tie) return { bucket: best, via: "fuzzy" };
  return null;
}

function normalizeHeading(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isNegated(normalized: string): boolean {
  // "nonbreaking" written as one word has no word boundary after "non".
  return /^(non|not|no)\b|^non(?=[a-z])/.test(normalized);
}

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[b.length]!;
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

/**
 * A top-level `<li>` is usually one ticket. Some releases (26.8.0) group tickets
 * under a model name instead: `<li><p>ClassicDeviceType</p><ul><li><strong>T-1</strong>…</li>
 * <li><strong>T-2</strong>…</li><li>Affected operations:<ul>…</ul></li></ul></li>`.
 * Split those into one item per ticket, each with the group's affected operations.
 */
function parseItems(innerHtml: string): RawItem[] {
  return collectGroupedTickets(innerHtml) ?? [parseItem(innerHtml)];
}

/**
 * Returns the tickets nested under a group `<li>` (at any depth), or null when
 * `innerHtml` is not a group. Each ticket inherits the operations listed by
 * non-ticket siblings at its own level and every level above it (26.8.0 nests
 * "VendorOs" → "Added 10 values:" → tickets).
 */
function collectGroupedTickets(innerHtml: string): RawItem[] | null {
  const sublistIdx = innerHtml.search(/<(ul|ol)\b/i);
  if (sublistIdx < 0) return null;
  const head = innerHtml.substring(0, sublistIdx);
  if (/<(strong|b)\b/i.test(head)) return null;

  const group = stripTags(head).replace(/:$/, "");
  const found: RawItem[] = [];
  const others: string[] = [];
  for (const child of extractTopLevelLi(innerHtml.substring(sublistIdx))) {
    if (/^\s*(<p[^>]*>\s*)?<(strong|b)\b/i.test(child)) { found.push(parseItem(child)); continue; }
    const nested = collectGroupedTickets(child);
    if (nested) found.push(...nested);
    else others.push(child);
  }
  if (found.length === 0) return null;

  const groupOps = extractAffectedOps(others.join(" "));
  return found.map((it) => ({
    ...it,
    description: group ? `${group}: ${it.description}` : it.description,
    affectedOps: [...new Set([...it.affectedOps, ...groupOps])],
  }));
}

function parseItem(innerHtml: string): RawItem {
  // A title may name several tickets: "<strong>FWD-1</strong>, <strong>FWD-2</strong> Text".
  const titleMatch = innerHtml.match(/<(strong|b)[^>]*>[\s\S]*?<\/\1>(?:\s*,\s*<(strong|b)[^>]*>[\s\S]*?<\/\2>)*/i);
  const title = titleMatch ? stripTags(titleMatch[0]).replace(/ ,/g, ",").trim() : "";

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
  "Non-breaking changes":       { op: "constrain", target: "schema",         severity: "notice",   detectable: true,  asAt: true },
  "Specification changes":      { op: "annotate",  target: "schema",         severity: "info",     detectable: false, asAt: true },
  "Documentation changes":      { op: "annotate",  target: "schema",         severity: "info",     detectable: false, asAt: true },
  // Unpublished APIs carry no stability guarantee, so these never rank above info.
  "Notable changes to unpublished APIs": { op: "annotate", target: "schema", severity: "info",     detectable: false, asAt: true },
  // Unknown section: keep it visible (notice) but claim nothing about its shape.
  "Unclassified":               { op: "annotate",  target: "schema",         severity: "notice",   detectable: false, asAt: true },
};

/** Mixed buckets ("Non-breaking changes") also announce new operations; map those items as additions. */
const NEW_OPERATION_RE = /\bNew operations?:/i;

function mappingFor(bucket: BucketName, item: RawItem) {
  const mixed = bucket === "Non-breaking changes" || bucket === "Unclassified";
  if (mixed && NEW_OPERATION_RE.test(item.description)) return BUCKET_TO_MAPPING["New operations"];
  return BUCKET_TO_MAPPING[bucket];
}

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
    for (const item of items) {
      const mapping = mappingFor(bucket, item);
      if (!mapping) continue;
      const pointers = item.affectedOps.length > 0 ? opsToPointers(item.affectedOps) : [SAFE_POINTER_FALLBACK];
      const ptr: string | string[] = pointers.length === 1 ? pointers[0]! : pointers;
      // The spec allows only ONE pointer in `at`. An item that affects N operations
      // becomes N entries cross-linked via `related`, instead of dropping N-1 of them.
      const atTargets = mapping.asAt ? pointers : [undefined];
      const ids = atTargets.map((_, k) => `CHG-${String(counter + k).padStart(3, "0")}`);
      counter += ids.length;
      atTargets.forEach((at, k) => {
        const entry: ChangeEntry = {
          id: ids[k]!,
          op: mapping.op,
          target: mapping.target,
          severity: mapping.severity,
          description: [item.title, item.description].filter(Boolean).join(" — ") || "(no description)",
        };
        if (mapping.breaking !== undefined) entry.breaking = mapping.breaking;
        if (mapping.detectable !== undefined) entry.detectable = mapping.detectable;
        if (at !== undefined) entry.at = at;
        if (mapping.asTo) entry.to = ptr;
        if (mapping.asFrom) entry.from = ptr;
        if (ids.length > 1) entry.related = ids.filter((_, j) => j !== k);
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
      });
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

  // Count release-note items, not entries: one item affecting N operations is
  // N `related` entries in the changeset. Keep only the first of each group.
  const logical = cs.changes.filter((x) => !x.related || x.related.every((r) => r > x.id));
  const totals = {
    breaking: logical.filter((x) => x.severity === "breaking" && x.breaking).length,
    deprecations: logical.filter((x) => x.op === "deprecate").length,
    notice: logical.filter((x) => x.severity === "notice").length,
    info: logical.filter((x) => x.severity === "info").length,
    total: logical.length,
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
