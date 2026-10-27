// Minimal, tolerant HTML → tree builder. Zero external imports.
// Good enough for server-rendered documentation pages (Docusaurus, Next.js,
// Fumadocs, Microsoft Learn). Not a spec-compliant parser: it handles void
// elements, raw-text elements, implicit </p> and </li>, and stray close tags.

export interface HtmlNode {
  readonly tag: string;
  readonly attrs: string;
  readonly children: Array<HtmlNode | string>;
}

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
/** Opening one of these closes an open <p>, as browsers do. */
const CLOSES_P = new Set([
  "address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figure", "footer",
  "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "p", "pre",
  "section", "table", "ul",
]);

export function parseHtmlTree(html: string): HtmlNode {
  const root: HtmlNode = { tag: "#root", attrs: "", children: [] };
  const stack: HtmlNode[] = [root];
  const top = () => stack[stack.length - 1]!;
  const closeTo = (tag: string) => {
    for (let i = stack.length - 1; i > 0; i--) {
      if (stack[i]!.tag === tag) { stack.length = i; return true; }
    }
    return false;
  };

  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!(?:doctype)?[^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) top().children.push(html.substring(last, m.index));
    last = re.lastIndex;
    if (!m[2]) continue; // comment, doctype, CDATA

    const tag = m[2].toLowerCase();
    if (m[1] === "/") {
      // </p> with no open <p> is a stray; ignore it like other unmatched closes.
      closeTo(tag);
      continue;
    }

    if (CLOSES_P.has(tag) && hasOpenBefore(stack, "p", BLOCK_SCOPE)) closeTo("p");
    if (tag === "li" && hasOpenBefore(stack, "li", LIST_SCOPE)) closeTo("li");

    const node: HtmlNode = { tag, attrs: m[3] ?? "", children: [] };
    top().children.push(node);
    const selfClosing = /\/\s*$/.test(m[3] ?? "");
    if (VOID.has(tag) || selfClosing) continue;

    if (RAW_TEXT.has(tag)) {
      const end = html.toLowerCase().indexOf(`</${tag}`, last);
      const stop = end < 0 ? html.length : end;
      node.children.push(html.substring(last, stop));
      const gt = end < 0 ? html.length : html.indexOf(">", end);
      last = gt < 0 ? html.length : gt + 1;
      re.lastIndex = last;
      continue;
    }
    stack.push(node);
  }
  if (last < html.length) top().children.push(html.substring(last));
  return root;
}

const BLOCK_SCOPE = new Set(["div", "section", "article", "main", "li", "td", "th", "details", "blockquote", "body"]);
const LIST_SCOPE = new Set(["ul", "ol"]);

/** True if `tag` is open on the stack without crossing a `scope` boundary first. */
function hasOpenBefore(stack: readonly HtmlNode[], tag: string, scope: ReadonlySet<string>): boolean {
  for (let i = stack.length - 1; i > 0; i--) {
    const t = stack[i]!.tag;
    if (t === tag) return true;
    if (scope.has(t)) return false;
  }
  return false;
}

// ─────────────────────────── queries ───────────────────────────

export function attr(node: HtmlNode, name: string): string | undefined {
  const m = node.attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

export function isNode(c: HtmlNode | string): c is HtmlNode {
  return typeof c !== "string";
}

export function findAll(node: HtmlNode, pred: (n: HtmlNode) => boolean): HtmlNode[] {
  const out: HtmlNode[] = [];
  const walk = (n: HtmlNode) => {
    for (const c of n.children) {
      if (!isNode(c)) continue;
      if (pred(c)) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

export function findFirst(node: HtmlNode, pred: (n: HtmlNode) => boolean): HtmlNode | undefined {
  for (const c of node.children) {
    if (!isNode(c)) continue;
    if (pred(c)) return c;
    const hit = findFirst(c, pred);
    if (hit) return hit;
  }
  return undefined;
}

/** Remove (in place) every descendant matching `pred`. */
export function prune(node: HtmlNode, pred: (n: HtmlNode) => boolean): void {
  for (let i = node.children.length - 1; i >= 0; i--) {
    const c = node.children[i]!;
    if (!isNode(c)) continue;
    if (pred(c)) node.children.splice(i, 1);
    else prune(c, pred);
  }
}

const BLOCK_TEXT_BREAK = new Set(["p", "div", "li", "br", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "summary"]);

/** Visible text with entities decoded and whitespace collapsed. */
export function textOf(node: HtmlNode | string): string {
  const parts: string[] = [];
  const walk = (n: HtmlNode | string) => {
    if (!isNode(n)) { parts.push(n); return; }
    if (RAW_TEXT.has(n.tag) && n.tag !== "textarea") return;
    if (BLOCK_TEXT_BREAK.has(n.tag)) parts.push(" ");
    for (const c of n.children) walk(c);
    if (BLOCK_TEXT_BREAK.has(n.tag)) parts.push(" ");
  };
  walk(node);
  return decodeEntities(parts.join("")).replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
}

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", rarr: "→", larr: "←", copy: "©", trade: "™",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED[e.toLowerCase()] ?? whole;
  });
}
