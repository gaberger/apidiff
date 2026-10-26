// Vendor-neutral release-notes segmentation. Zero external imports beyond domain/.
//
// Cuts any server-rendered changelog page into items using layout only — never
// the meaning of headings — then audits completeness: every ID-like token and
// every `METHOD /path` on the page must land in some item. Classification
// (breaking / deprecation / addition) is deliberately NOT done here.
//
// Layout rules, derived from Forward, GitHub, PagerDuty, NetBox, Stripe, Okta,
// Atlassian, Slack, Twilio and Microsoft Graph changelogs:
//   1. Drop page furniture (nav, sidebars, footers, "On this page", …).
//   2. A page of ≥3 sibling <article>s is a feed: segment each post on its own.
//   3. In each lowest-level heading section: if it is mainly lists, every
//      top-level <li> is one item; if it opens with prose, the section is one item.

import {
  type HtmlNode,
  attr,
  findAll,
  findFirst,
  isNode,
  parseHtmlTree,
  prune,
  textOf,
} from "./html-tree.js";

export interface Segment {
  /** Heading path from the outermost section (or feed post title) down. */
  readonly trail: readonly string[];
  readonly title: string;
  readonly text: string;
  /** Ticket-like IDs (FWD-123, OKTA-123, CVE-2025-1234) and issue refs (#19234). */
  readonly ids: readonly string[];
  /** `METHOD /path` signatures. */
  readonly ops: readonly string[];
  readonly links: readonly string[];
  /** First date found in the trail or a <time> element, as written. */
  readonly date?: string;
  readonly shape: "list-item" | "section";
}

export interface SegmentAudit {
  readonly pageIds: readonly string[];
  readonly missingIds: readonly string[];
  readonly pageOps: readonly string[];
  readonly missingOps: readonly string[];
}

export interface SegmentResult {
  readonly container: "main" | "article" | "page";
  readonly feedPosts: number;
  readonly segments: readonly Segment[];
  readonly audit: SegmentAudit;
}

// ─────────────────────────── furniture ───────────────────────────

const FURNITURE_TAGS = new Set([
  "script", "style", "svg", "noscript", "template", "button", "form", "nav", "aside", "footer", "iframe", "select",
]);
const FURNITURE_ROLES = /^(navigation|banner|contentinfo|search|complementary|tablist)$/i;
const FURNITURE_CLASS = /sidebar|breadcrumb|\btoc\b|table-of-contents|tableofcontents|pagination|navbar|skip-?link/i;
const FURNITURE_HEADINGS =
  /^(on this page|in this article|table of contents|contents|related (content|articles|links|topics)|additional (resources|links)|feedback|see also|next steps|subscribe\b.*|contribute\b.*|was this (page|article) helpful\??)$/i;
const EMPTY_SECTION = /^(none|n\/a|no changes?|nothing (new|to report))\.?$/i;

function isFurniture(n: HtmlNode): boolean {
  if (FURNITURE_TAGS.has(n.tag)) return true;
  if (n.tag === "header" && findFirst(n, (c) => c.tag === "nav")) return true;
  const role = attr(n, "role");
  if (role && FURNITURE_ROLES.test(role)) return true;
  const cls = attr(n, "class");
  // Class names describe layout state ("show-table-of-contents", "Sidebar--expanded",
  // Docusaurus's "anchorTargetStickyNavbar" on every <h2>). Only trust them on
  // non-heading elements that hold no headings.
  if (/^h[1-6]$/.test(n.tag)) return false;
  return !!cls && FURNITURE_CLASS.test(cls) && !findFirst(n, (c) => /^h[1-6]$/.test(c.tag));
}

// ─────────────────────────── extraction ───────────────────────────

const ID_RE = /\b(CVE-\d{4}-\d{4,7}|[A-Z][A-Z0-9]{1,9}-\d{2,7})\b|(?<![\w&#])#(\d{3,6})\b/g;
/** Prefixes that look like tickets but are standards or algorithms. */
const ID_STOPLIST = new Set(["SHA", "ISO", "RFC", "UTF", "AES", "RSA", "TLS", "SSL", "HTTP", "IPV", "MD", "PKCS", "ECDSA", "HMAC", "WCAG", "UTC", "GMT"]);
const OP_RE = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^\s"'<>()`,;]*)/g;
const DATE_RE =
  /\b(\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2},? \d{4}|\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4})\b/;

export function extractIds(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(ID_RE)) {
    if (m[2]) { out.add(`#${m[2]}`); continue; }
    const id = m[1]!;
    if (!id.startsWith("CVE-") && ID_STOPLIST.has(id.split("-")[0]!)) continue;
    out.add(id);
  }
  return [...out];
}

export function extractOps(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(OP_RE)) out.add(`${m[1]} ${m[2]!.replace(/[.:]+$/, "")}`);
  return [...out];
}

// ─────────────────────────── blocks ───────────────────────────

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; node: HtmlNode }
  | { kind: "para"; node: HtmlNode | string; text: string };

const CONTENT_BLOCKS = new Set(["p", "pre", "blockquote", "table", "details", "dl", "figure", "time"]);
const CONTAINERS = new Set(["div", "section", "article", "main", "header", "body", "html", "#root"]);
const BLOCK_TAGS = /^(h[1-6]|ul|ol|p|div|section|table|pre|blockquote|details|article)$/;

function hasBlockDescendant(n: HtmlNode): boolean {
  return !!findFirst(n, (c) => BLOCK_TAGS.test(c.tag));
}

/** The element's children if they are ≥2 block-level <a> cards and nothing else; otherwise undefined. */
function cardChildren(n: HtmlNode): HtmlNode[] | undefined {
  const kids = n.children.filter((c): c is HtmlNode => isNode(c));
  const loose = n.children.some((c) => !isNode(c) && c.trim());
  if (loose || kids.length < 2) return undefined;
  return kids.every((k) => k.tag === "a" && hasBlockDescendant(k)) ? kids : undefined;
}

/** Flatten a subtree to headings, lists and paragraphs in document order. */
function flatten(node: HtmlNode, out: Block[] = []): Block[] {
  let inline: Array<HtmlNode | string> = [];
  const flushInline = () => {
    const text = inline.map(textOf).join(" ").replace(/\s+/g, " ").trim();
    if (text) out.push({ kind: "para", node: { tag: "#inline", attrs: "", children: inline }, text });
    inline = [];
  };
  for (const c of node.children) {
    if (!isNode(c)) { inline.push(c); continue; }
    const h = c.tag.match(/^h([1-6])$/);
    if (h) {
      flushInline();
      const text = textOf(c);
      if (text) out.push({ kind: "heading", level: Number(h[1]), text });
    } else if (c.tag === "ul" || c.tag === "ol") {
      flushInline();
      out.push({ kind: "list", node: c });
    } else if (CONTENT_BLOCKS.has(c.tag)) {
      flushInline();
      const text = textOf(c);
      if (text) out.push({ kind: "para", node: c, text });
    } else if (cardChildren(c)) {
      // A run of sibling link cards (Stripe's ChangelogRow) is a list in all but markup.
      flushInline();
      const cards = cardChildren(c)!;
      out.push({ kind: "list", node: { tag: "ul", attrs: "", children: cards.map((a) => ({ tag: "li", attrs: "", children: [a] })) } });
    } else if (c.tag === "a" && hasBlockDescendant(c)) {
      // A lone card: keep the <a> itself so its href survives.
      flushInline();
      const text = textOf(c);
      if (text) out.push({ kind: "para", node: c, text });
    } else if (CONTAINERS.has(c.tag) || hasBlockDescendant(c)) {
      // Some sites wrap headings and lists in <span>, <a> or custom elements.
      flushInline();
      flatten(c, out);
    } else {
      inline.push(c);
    }
  }
  flushInline();
  return out;
}

// ─────────────────────────── sections → segments ───────────────────────────

const PROSE_MIN_CHARS = 160;

function isAnchored(text: string): boolean {
  return extractIds(text).length > 0 || extractOps(text).length > 0;
}

function isIntro(text: string): boolean {
  return text.endsWith(":") || text.length < PROSE_MIN_CHARS;
}

function segmentBlocks(blocks: readonly Block[], baseTrail: readonly string[], baseDate?: string): Segment[] {
  const out: Segment[] = [];
  const stack: Array<{ level: number; text: string }> = [];
  let i = 0;

  // Content before the first heading behaves like a non-leaf section.
  const firstHeading = blocks.findIndex((b) => b.kind === "heading");
  const preamble = blocks.slice(0, firstHeading < 0 ? blocks.length : firstHeading);
  out.push(...sectionItems(preamble, baseTrail, baseDate, false));
  i = firstHeading < 0 ? blocks.length : firstHeading;

  while (i < blocks.length) {
    const h = blocks[i] as Extract<Block, { kind: "heading" }>;
    while (stack.length && stack[stack.length - 1]!.level >= h.level) stack.pop();
    stack.push({ level: h.level, text: h.text });
    let j = i + 1;
    while (j < blocks.length && blocks[j]!.kind !== "heading") j++;
    const next = blocks[j] as Extract<Block, { kind: "heading" }> | undefined;
    const isLeaf = !next || next.level <= h.level;
    const trail = [...baseTrail, ...stack.map((s) => s.text)];
    if (!stack.some((s) => FURNITURE_HEADINGS.test(s.text))) {
      out.push(...sectionItems(blocks.slice(i + 1, j), trail, baseDate, isLeaf));
    }
    i = j;
  }
  return out;
}

/**
 * Items for one section's own content. Leaf sections that open with prose are
 * one item; otherwise each top-level <li> is an item. Non-leaf sections only
 * contribute list items — their prose is usually an intro or a summary table.
 */
function sectionItems(content: readonly Block[], trail: readonly string[], baseDate: string | undefined, isLeaf: boolean): Segment[] {
  if (content.length === 0) return [];
  const allText = content.map(blockText).join(" ").trim();
  if (EMPTY_SECTION.test(allText)) return [];

  const firstList = content.findIndex((b) => b.kind === "list");
  const lead = content.slice(0, firstList < 0 ? content.length : firstList);
  const leadIsProse = lead.some((b) => b.kind === "para" && !isIntro(b.text));
  const date = trail.map((t) => t.match(DATE_RE)?.[1]).find(Boolean) ?? findDate(content) ?? baseDate;

  if (firstList >= 0 && !(isLeaf && leadIsProse)) {
    const out: Segment[] = [];
    for (const b of content.slice(firstList)) {
      if (b.kind === "list") {
        for (const li of b.node.children) {
          if (isNode(li) && li.tag === "li") out.push(...listItemSegments(li, trail, date, []));
        }
      }
    }
    // Non-list blocks are kept as one more item when they are prose after the
    // lists (an advisory, a migration note) or anchored anywhere (a code sample
    // naming an endpoint).
    const extra = content.filter((b, k) =>
      b.kind === "para" && ((isLeaf && k > firstList && !isIntro(b.text)) || isAnchored(b.text)));
    if (extra.length) out.push(makeSegment(extra.map(blockNode), trail, date, "section"));
    return out;
  }
  const seg = makeSegment(content.map(blockNode), trail, date, "section");
  // Intro prose and summary tables of non-leaf sections are usually noise —
  // unless they name an ID or an operation. Never drop anchored content.
  if (!isLeaf && seg.ids.length === 0 && seg.ops.length === 0) return [];
  return [seg];
}

/**
 * One <li> → one item, unless the <li> is only a label over a sub-list whose
 * entries carry their own IDs (Forward 26.8.0: "ClassicDeviceType" over three
 * tickets, one of them breaking). Then each ID-bearing entry is an item, with
 * the label added to its trail and the operations of ID-less siblings
 * ("Affected operations: …") shared with every entry. Recurses for deeper labels.
 */
function listItemSegments(li: HtmlNode, trail: readonly string[], date: string | undefined, inheritedOps: readonly string[]): Segment[] {
  const whole = () => {
    const seg = makeSegment([li], trail, date, "list-item");
    return seg.text ? [{ ...seg, ops: [...new Set([...seg.ops, ...inheritedOps])] }] : [];
  };
  const kids = li.children;
  const firstList = kids.findIndex((c) => isNode(c) && (c.tag === "ul" || c.tag === "ol"));
  if (firstList < 0) return whole();
  const label = kids.slice(0, firstList).map(textOf).join(" ").replace(/\s+/g, " ").trim();
  if (extractIds(label).length > 0) return whole();

  const subItems = kids.slice(firstList)
    .filter((c): c is HtmlNode => isNode(c) && (c.tag === "ul" || c.tag === "ol"))
    .flatMap((l) => l.children.filter((c): c is HtmlNode => isNode(c) && c.tag === "li"));
  const withIds = subItems.filter((s) => extractIds(textOf(s)).length > 0);
  if (withIds.length === 0) return whole();

  const sharedOps = [...new Set([...inheritedOps, ...subItems.filter((s) => !withIds.includes(s)).flatMap((s) => extractOps(textOf(s)))])];
  const subTrail = label ? [...trail, label] : trail;
  if (withIds.length === 1) {
    // One ID-bearing entry may itself be a label over tickets ("Added 10 values:" → tickets).
    const inner = listItemSegments(withIds[0]!, subTrail, date, sharedOps);
    return inner.length > 1 ? inner : whole();
  }
  return withIds.flatMap((s) => listItemSegments(s, subTrail, date, sharedOps));
}

function blockNode(b: Block): HtmlNode | string {
  return b.kind === "heading" ? b.text : b.node;
}

function blockText(b: Block): string {
  return b.kind === "list" ? textOf(b.node) : b.text;
}

function findDate(content: readonly Block[]): string | undefined {
  for (const b of content) {
    if (b.kind !== "para" || typeof b.node === "string") continue;
    if (b.node.tag === "time") return attr(b.node, "datetime")?.slice(0, 10) ?? b.text;
  }
  return undefined;
}

function makeSegment(nodes: ReadonlyArray<HtmlNode | string>, trail: readonly string[], date: string | undefined, shape: Segment["shape"]): Segment {
  const text = nodes.map(textOf).join(" ").replace(/\s+/g, " ").trim();
  const links = new Set<string>();
  for (const n of nodes) {
    if (!isNode(n)) continue;
    for (const a of [n, ...findAll(n, (x) => x.tag === "a")]) {
      const href = a.tag === "a" ? attr(a, "href") : undefined;
      if (href && !href.startsWith("#") && !href.startsWith("javascript:")) links.add(href);
    }
  }
  const title = shape === "section" && trail.length ? trail[trail.length - 1]! : itemTitle(nodes, text);
  // A section's heading is its title and often carries the ID ("Module Type Profiles (#19002)").
  const searchable = shape === "section" ? `${title} ${text}` : text;
  return { trail, title, text, ids: extractIds(searchable), ops: extractOps(searchable), links: [...links], date, shape };
}

function itemTitle(nodes: ReadonlyArray<HtmlNode | string>, text: string): string {
  const first = nodes[0];
  if (first && isNode(first)) {
    const strong = findFirst(first, (n) => n.tag === "strong" || n.tag === "b");
    const s = strong ? textOf(strong) : "";
    if (s && text.startsWith(s.slice(0, 20))) return s;
  }
  const sentence = text.match(/^(.{1,140}?[.!?])(\s|$)/);
  return sentence ? sentence[1]! : text.slice(0, 140);
}

// ─────────────────────────── entry point ───────────────────────────

export function segmentReleaseNotes(html: string): SegmentResult {
  const root = parseHtmlTree(html);
  prune(root, isFurniture);

  const main = findFirst(root, (n) => n.tag === "main");
  const topArticles = (n: HtmlNode) => findAll(n, (x) => x.tag === "article").filter((a, _, all) => !all.some((o) => o !== a && findFirst(o, (x) => x === a)));
  const container = main ?? (topArticles(root).length === 1 ? topArticles(root)[0]! : root);
  const containerKind: SegmentResult["container"] = main ? "main" : container === root ? "page" : "article";

  const posts = topArticles(container);
  const segments: Segment[] = [];
  if (posts.length >= 3) {
    // Feed: segment each post separately so one post's headings never swallow the next.
    for (const post of posts) segments.push(...segmentBlocks(flatten(post), []));
  } else {
    segments.push(...segmentBlocks(flatten(container), []));
  }

  const pageText = textOf(container);
  const pageIds = extractIds(pageText);
  const pageOps = extractOps(pageText);
  const gotIds = new Set(segments.flatMap((s) => s.ids));
  const gotOps = new Set(segments.flatMap((s) => s.ops));
  return {
    container: containerKind,
    feedPosts: posts.length >= 3 ? posts.length : 0,
    segments,
    audit: {
      pageIds,
      missingIds: pageIds.filter((x) => !gotIds.has(x)),
      pageOps,
      missingOps: pageOps.filter((x) => !gotOps.has(x)),
    },
  };
}
