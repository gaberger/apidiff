// build-site.ts
//
// Generates the static spec website from apidiffspec/. Every operation,
// target kind and field on the page is read from api-changeset-schema.json,
// and every example is read from disk, so the site cannot drift from the spec.
//
// Usage: bun scripts/build-site.ts [outDir]   (default: site-dist)

import { mkdirSync, readdirSync, copyFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse as yamlParse } from "yaml";

type Json = Record<string, any>;

export interface Example {
  file: string; // path relative to apidiffspec/, e.g. "examples/01-structural.yaml"
  text: string;
}

const FAMILIES = ["structural", "constraint", "semantic", "lifecycle"] as const;
type Family = (typeof FAMILIES)[number];

const FAMILY_BLURB: Record<Family, string> = {
  structural: "The shape changed: something was added, removed, renamed or moved.",
  constraint: "The rules changed: a type, limit, default or encoding is different.",
  semantic: "The meaning changed, but the shape did not. A spec diff cannot see these.",
  lifecycle: "The status changed: deprecated, sunset, restored or withdrawn.",
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline `code` and 'quoted' identifiers in schema prose become <code>. */
function prose(s: string): string {
  return escapeHtml(s).replace(/&#39;([\w./~#{}-]+)&#39;/g, "<code>$1</code>");
}

/** Line-based YAML highlighter: comments, keys, list dashes, quoted strings. */
export function highlightYaml(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      const m = line.match(/^(\s*)(- )?([\w$.-]+)(:)(.*)$/);
      let head = "";
      let rest = line;
      if (m) {
        head =
          escapeHtml(m[1]!) +
          (m[2] ? `<span class="y-dash">- </span>` : "") +
          `<span class="y-key">${escapeHtml(m[3]!)}</span>:`;
        rest = m[5]!;
      }
      // Comment: a # at the start of the remainder or after whitespace, outside quotes.
      let body = rest;
      let comment = "";
      const c = rest.match(/^((?:[^"'#]|"[^"]*"|'[^']*')*?)(^|\s)(#.*)$/);
      if (c) {
        body = c[1]! + c[2]!;
        comment = c[3]!;
      }
      const bodyHtml = escapeHtml(body).replace(
        /(&quot;.*?&quot;)/g,
        `<span class="y-str">$1</span>`,
      );
      return head + bodyHtml + (comment ? `<span class="y-com">${escapeHtml(comment)}</span>` : "");
    })
    .join("\n");
}

interface Op {
  name: string;
  family: Family;
  note?: string; // e.g. "author-only"
  description: string;
}

export function operations(schema: Json): Op[] {
  return (schema.$defs.operation.oneOf as Json[]).map((o) => {
    const desc: string = o.description ?? "";
    const m = desc.match(/^(\w+)(?:\s*\(([^)]*)\))?\.\s*(.*)$/s);
    const fam = (m?.[1] ?? "").toLowerCase();
    if (!FAMILIES.includes(fam as Family)) {
      throw new Error(`operation '${o.const}' has no family prefix in its description`);
    }
    return { name: o.const, family: fam as Family, note: m![2], description: m![3]! };
  });
}

function fieldRows(props: Json, required: string[], defs: Json): string {
  return Object.entries(props)
    .map(([name, p]) => {
      let desc: string = p.description ?? "";
      let type = "";
      const ref: string | undefined = p.$ref ?? p.items?.$ref;
      if (ref) {
        const def = ref.split("/").pop()!;
        desc ||= defs[def]?.description ?? "";
        type = `<a href="#def-${def}"><code>${escapeHtml(def)}</code></a>`;
        if (p.items) type += " list";
      } else if (p.enum) {
        type = p.enum.map((e: string) => `<code>${escapeHtml(String(e))}</code>`).join(" ");
      } else if (p.type) {
        type = `<code>${escapeHtml([p.type].flat().join(" | "))}</code>`;
        if (p.format) type += ` <span class="muted">(${escapeHtml(p.format)})</span>`;
      }
      const req = required.includes(name) ? `<span class="req">required</span>` : "";
      return `<tr><td><code>${escapeHtml(name)}</code> ${req}</td><td>${type}</td><td>${prose(desc)}</td></tr>`;
    })
    .join("\n");
}

function fieldTable(id: string, title: string, intro: string, def: Json, defs: Json): string {
  return `
<h3 id="def-${id}">${escapeHtml(title)}</h3>
${intro ? `<p>${prose(intro)}</p>` : ""}
<div class="table-wrap"><table class="fields">
<thead><tr><th>Field</th><th>Type</th><th>Meaning</th></tr></thead>
<tbody>${fieldRows(def.properties ?? {}, def.required ?? [], defs)}</tbody>
</table></div>`;
}

/** The hero shows one real change entry: the first `retype` in the examples. */
function heroChange(examples: Example[]): { yaml: string; before: string; after: string } | null {
  for (const ex of examples) {
    const lines = ex.text.split("\n");
    const start = lines.findIndex((l) => /^\s*op:\s*retype\b/.test(l));
    if (start < 0) continue;
    // Walk back to the list item that owns this op, then forward to the next item.
    let s = start;
    while (s > 0 && !/^\s*- /.test(lines[s]!)) s--;
    const indent = lines[s]!.match(/^(\s*)/)![1]!.length;
    let e = s + 1;
    while (e < lines.length) {
      const l = lines[e]!;
      if (l.trim() && (l.match(/^(\s*)/)![1]!.length < indent || (l.match(/^(\s*)/)![1]!.length === indent && /^\s*- /.test(l)))) break;
      if (/^\s*#/.test(l) && l.match(/^(\s*)/)![1]!.length <= indent) break;
      e++;
    }
    const block = lines.slice(s, e).join("\n").replace(/\s+$/, "");
    const dedented = block
      .split("\n")
      .map((l) => l.slice(indent))
      .join("\n");
    // Keep the payloads as written: JSON.stringify would turn 12.50 into 12.5.
    const pay = dedented.match(/example:\s*\n\s*before:\s*(.+?)\s*\n\s*after:\s*(.+?)\s*(?:#.*)?$/m);
    return { yaml: dedented, before: pay?.[1] ?? "", after: pay?.[2] ?? "" };
  }
  return null;
}

/** First comment block of an example file, without the `#` markers. */
function exampleIntro(text: string): { title: string; body: string } {
  const comments: string[] = [];
  for (const l of text.split("\n")) {
    if (/^#/.test(l)) comments.push(l.replace(/^#\s?/, ""));
    else if (comments.length) break;
  }
  const [title = "", ...rest] = comments;
  return { title: title.trim(), body: rest.join("\n").trim() };
}

export function renderSite(schema: Json, examples: Example[]): string {
  const defs = schema.$defs as Json;
  const ops = operations(schema);
  const version: string = schema.properties.changeset_version?.const ?? schema.$id?.match(/(\d+\.\d+)\.json$/)?.[1] ?? "";
  const targets: string[] = defs.target_kind.enum;
  const hero = heroChange(examples);

  const opsByFamily = FAMILIES.map((f) => {
    const rows = ops
      .filter((o) => o.family === f)
      .map((o) => `<tr class="fam-${f}"><td><code class="op">${escapeHtml(o.name)}</code>${o.note ? `<br><span class="note">${escapeHtml(o.note)}</span>` : ""}</td><td>${prose(o.description)}</td></tr>`)
      .join("\n");
    return `
<section class="family fam-${f}" id="family-${f}">
  <h3><span class="swatch" aria-hidden="true"></span>${f[0]!.toUpperCase() + f.slice(1)}</h3>
  <p>${escapeHtml(FAMILY_BLURB[f])}</p>
  <div class="table-wrap"><table class="ops"><tbody>${rows}</tbody></table></div>
</section>`;
  }).join("\n");

  const exampleSections = examples
    .map((ex) => {
      const { title, body } = exampleIntro(ex.text);
      const id = "ex-" + ex.file.replace(/^examples\//, "").replace(/\.(ya?ml|json)$/, "").replace(/[^\w-]/g, "-");
      const changes = ((yamlParse(ex.text) as Json)?.changes ?? []) as Json[];
      const usedOps = [...new Set(changes.map((c) => c.op as string))];
      const famOf = new Map(ops.map((o) => [o.name, o.family]));
      const chips = usedOps
        .map((o) => `<code class="op fam-${famOf.get(o) ?? "structural"}">${escapeHtml(o)}</code>`)
        .join(" ");
      return `
<section class="example" id="${id}">
  <h3>${escapeHtml(title || ex.file)}</h3>
  ${body ? `<p>${prose(body.replace(/\n(?!\n)/g, " "))}</p>` : ""}
  <p class="example-meta">${changes.length} change${changes.length === 1 ? "" : "s"}: ${chips}</p>
  <details>
    <summary>Show <code>${escapeHtml(ex.file)}</code></summary>
    <pre class="yaml"><code>${highlightYaml(ex.text.replace(/\s+$/, ""))}</code></pre>
  </details>
  <p><a href="${escapeHtml(ex.file)}" download>Download ${escapeHtml(ex.file.split("/").pop()!)}</a></p>
</section>`;
    })
    .join("\n");

  const heroHtml = hero
    ? `
<figure class="hero-change">
  <pre class="yaml"><code>${highlightYaml(hero.yaml)}</code></pre>
  <figcaption>
    <div class="payload"><span class="payload-label">Payload before</span><pre><code>${escapeHtml(hero.before)}</code></pre></div>
    <div class="payload"><span class="payload-label">Payload after</span><pre><code>${escapeHtml(hero.after)}</code></pre></div>
  </figcaption>
</figure>`
    : "";

  const toc = [
    ["what", "What it is"],
    ["anatomy", "A change entry"],
    ["operations", "Operations"],
    ["severity", "Severity"],
    ["pointers", "Pointers"],
    ["fields", "Field reference"],
    ["targets", "Target kinds"],
    ["examples", "Examples"],
    ["tooling", "Tooling"],
  ]
    .map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>API Changeset ${escapeHtml(version)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22%3E%3Ccircle cx=%228%22 cy=%228%22 r=%227%22 fill=%22%23a8650f%22/%3E%3C/svg%3E">
<meta name="description" content="A YAML format for describing what changed between two versions of an OpenAPI document, including changes a spec diff cannot see.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=swap" rel="stylesheet">
<style>
:root {
  --paper: #f5f7f9;
  --ink: #1d2433;
  --muted: #5b6577;
  --rule: #d9dee6;
  --code-bg: #ebeff4;
  --structural: #2f6fdb;
  --constraint: #a8650f;
  --semantic: #8b3fb8;
  --lifecycle: #c2413a;
  --y-key: #1f5bbf;
  --y-str: #2c7a4b;
  --y-com: #7a8494;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #12161f;
    --ink: #e4e8ef;
    --muted: #9aa4b5;
    --rule: #2a3242;
    --code-bg: #1b2130;
    --structural: #6b9cf0;
    --constraint: #e0a14a;
    --semantic: #c18be0;
    --lifecycle: #ef7a72;
    --y-key: #82aef5;
    --y-str: #7cc79a;
    --y-com: #7d8799;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: 400 1.0625rem/1.65 "Source Serif 4", Georgia, serif;
  font-optical-sizing: auto;
}
a { color: var(--structural); text-underline-offset: 0.18em; }
a:focus-visible, summary:focus-visible { outline: 2px solid var(--structural); outline-offset: 3px; border-radius: 2px; }
code, pre { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 0.84em; }
:not(pre) > code { background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 3px; }
pre { margin: 0; overflow-x: auto; line-height: 1.55; }
.layout {
  display: grid;
  grid-template-columns: 14rem minmax(0, 46rem);
  gap: 4rem;
  max-width: 68rem;
  margin: 0 auto;
  padding: 3rem 1.5rem 6rem;
}
nav.toc { position: sticky; top: 2rem; align-self: start; font-size: 0.95rem; }
nav.toc .mark { font-weight: 700; font-size: 1.05rem; margin: 0 0 1rem; }
nav.toc ul { list-style: none; margin: 0; padding: 0; border-left: 1px solid var(--rule); }
nav.toc li a { display: block; padding: 0.2rem 0 0.2rem 0.9rem; color: var(--muted); text-decoration: none; }
nav.toc li a:hover { color: var(--ink); }
main { min-width: 0; }
h1 { font-size: clamp(2.4rem, 5vw, 3.4rem); line-height: 1.05; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 1rem; }
h1 .ver { font-weight: 400; color: var(--muted); }
.lede { font-size: 1.3rem; line-height: 1.5; margin: 0 0 2.5rem; max-width: 38rem; }
h2 { font-size: 1.75rem; line-height: 1.2; margin: 4rem 0 1rem; letter-spacing: -0.01em; scroll-margin-top: 1.5rem; }
h3 { font-size: 1.25rem; margin: 2.25rem 0 0.5rem; scroll-margin-top: 1.5rem; }
p { margin: 0 0 1rem; max-width: 40rem; }
.muted { color: var(--muted); }

/* Hero: one real change, with the payload it changes. */
.hero-change { margin: 0 0 1rem; border: 1px solid var(--rule); border-left: 4px solid var(--constraint); background: var(--code-bg); border-radius: 0 6px 6px 0; }
.hero-change > pre { padding: 1.25rem 1.25rem 1rem; font-size: 0.82rem; }
.hero-change figcaption { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--rule); }
.payload { padding: 1.1rem 1.25rem 1.2rem; }
.payload + .payload { border-left: 1px solid var(--rule); }
.payload-label { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 0.25rem; }
.payload pre { font-size: 1.35rem; font-weight: 600; }
.payload:last-child pre { color: var(--constraint); }
.hero-note { font-size: 0.95rem; color: var(--muted); }

.yaml .y-key { color: var(--y-key); }
.yaml .y-str { color: var(--y-str); }
.yaml .y-com { color: var(--y-com); font-style: italic; }
.yaml .y-dash { color: var(--muted); }

/* Operation families: color is the family. */
.fam-structural { --fam: var(--structural); }
.fam-constraint { --fam: var(--constraint); }
.fam-semantic { --fam: var(--semantic); }
.fam-lifecycle { --fam: var(--lifecycle); }
.family h3 { display: flex; align-items: center; gap: 0.6rem; }
.swatch { width: 0.85rem; height: 0.85rem; border-radius: 50%; background: var(--fam); flex: none; }
code.op { color: var(--fam); background: transparent; font-weight: 600; padding: 0; }
.example-meta code.op { margin-right: 0.4rem; }
.table-wrap { overflow-x: auto; margin: 0.5rem 0 1rem; }
table { border-collapse: collapse; width: 100%; font-size: 0.97rem; }
th { text-align: left; font-weight: 600; color: var(--muted); border-bottom: 1px solid var(--ink); padding: 0.4rem 0.75rem 0.4rem 0; }
td { vertical-align: top; border-bottom: 1px solid var(--rule); padding: 0.55rem 0.75rem 0.55rem 0; }
table.ops td:first-child { width: 9rem; border-left: 3px solid var(--fam); padding-left: 0.75rem; }
table.fields td:first-child { white-space: nowrap; }
.note { font-size: 0.82rem; color: var(--muted); font-style: italic; }
.req { font-size: 0.8rem; color: var(--lifecycle); }

.severity { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--rule); border: 1px solid var(--rule); margin: 1rem 0 1.5rem; }
.severity div { background: var(--paper); padding: 0.9rem 1rem; }
.severity div code { font-weight: 600; }
.severity p { margin: 0.3rem 0 0; font-size: 0.95rem; }

.targets { columns: 3 11rem; padding: 0; list-style: none; margin: 0.5rem 0 1rem; }
.targets li { padding: 0.1rem 0; }

.example { border-top: 1px solid var(--rule); padding-top: 0.5rem; margin-top: 2rem; }
.example h3 { margin-top: 1rem; }
details { margin: 0.75rem 0; }
summary { cursor: pointer; color: var(--structural); }
details pre { background: var(--code-bg); padding: 1rem 1.25rem; margin-top: 0.75rem; border-radius: 6px; font-size: 0.8rem; max-height: 36rem; }

footer { margin-top: 5rem; padding-top: 1.5rem; border-top: 1px solid var(--rule); color: var(--muted); font-size: 0.92rem; }

@media (max-width: 900px) {
  .layout { grid-template-columns: minmax(0, 1fr); gap: 0; padding: 1.5rem 1rem 4rem; }
  nav.toc { position: static; margin-bottom: 2rem; }
  nav.toc ul { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; border: 0; }
  nav.toc li a { padding: 0; }
  .hero-change figcaption { grid-template-columns: 1fr; }
  .hero-change > pre { font-size: 0.74rem; padding: 1rem; }
  .payload + .payload { border-left: 0; border-top: 1px solid var(--rule); }
  .severity { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<div class="layout">
<nav class="toc" aria-label="Contents">
  <p class="mark">API Changeset</p>
  <ul>${toc}</ul>
</nav>
<main>
<header>
  <h1>API Changeset <span class="ver">${escapeHtml(version)}</span></h1>
  <p class="lede">A YAML format for saying what changed between two versions of an OpenAPI document, and what a client has to do about it.</p>
  ${heroHtml}
  <p class="hero-note">One change from <a href="#ex-02-constraint">the constraint example</a>. A spec diff sees that <code>amount</code> became an integer. Only the changeset says it now counts cents, and how to convert.</p>
</header>

<h2 id="what">What it is</h2>
<p>${prose(schema.description)}</p>
<p>A changeset is written next to the two specs, not derived from them. A tool can fill in what it detects. The API author adds what only they know: meaning, timing, and migration advice.</p>
<p>Read the <a href="api-changeset-schema.json">JSON Schema (Draft 2020-12)</a> or the <a href="example-changeset.yaml">full annotated example</a>.</p>

<h2 id="anatomy">A change entry</h2>
<p>Every entry in <code>changes</code> answers three questions. What kind of change is it (<code>op</code>)? What does it touch (<code>target</code>)? Where is it in the specs (<code>at</code>, <code>from</code>, <code>to</code>)? The rest is optional context: severity, a description, before and after snapshots, migration advice, and lifecycle dates.</p>
<p>The only required fields are ${(defs.change.required as string[]).map((r) => `<code>${escapeHtml(r)}</code>`).join(", ")}. The document itself needs ${(schema.required as string[]).map((r) => `<code>${escapeHtml(r)}</code>`).join(", ")}.</p>

<h2 id="operations">Operations</h2>
<p>${ops.length} operations in four families. The family tells a reader how much a spec diff can help: structural and constraint changes are usually detectable, and semantic changes never are.</p>
${opsByFamily}

<h2 id="severity">Severity</h2>
<p>Severity is separate from <code>breaking</code>. A change can be non-breaking and still need attention.</p>
<div class="severity">
  <div><code>info</code><p>Cosmetic or internal. Nobody needs to act.</p></div>
  <div><code>notice</code><p>Not breaking, but behaviour changes: a new enum value, a new rate limit.</p></div>
  <div><code>breaking</code><p>Clients must change. A <code>migration</code> block is required.</p></div>
</div>

<h2 id="pointers">Pointers</h2>
<p>Locations are <a href="https://www.rfc-editor.org/rfc/rfc6901">JSON Pointers (RFC 6901)</a>, optionally with a leading <code>#</code>. Use <code>at</code> for a change in place, <code>from</code> for where something was, and <code>to</code> for where it is now. When one change touches many places, such as a field renamed in 12 schemas, write one entry with a list of pointers, not 12 entries. <a href="#ex-05-multi-pointer">See the multi-pointer example.</a></p>
<p>Lifecycle dates follow <a href="https://www.rfc-editor.org/rfc/rfc9745">RFC 9745 (Deprecation)</a> and <a href="https://www.rfc-editor.org/rfc/rfc8594">RFC 8594 (Sunset)</a>.</p>

<h2 id="fields">Field reference</h2>
<p>Generated from the schema.</p>
${fieldTable("document", "Document", "", schema, defs)}
${fieldTable("change", "Change entry", "", defs.change, defs)}
${fieldTable("migration", "migration", defs.migration.description ?? "", defs.migration, defs)}
${fieldTable("lifecycle", "lifecycle", defs.lifecycle.description ?? "", defs.lifecycle, defs)}
${fieldTable("spec_reference", "spec_reference", defs.spec_reference.description ?? "", defs.spec_reference, defs)}

<h2 id="targets">Target kinds</h2>
<p>${prose(defs.target_kind.description ?? "What part of the API a change touches.")}</p>
<ul class="targets">${targets.map((t) => `<li><code>${escapeHtml(t)}</code></li>`).join("")}</ul>

<h2 id="examples">Examples</h2>
<p>Every example below passes schema validation in CI. Copy one as a starting point.</p>
${exampleSections}

<h2 id="tooling">Tooling</h2>
<p>The <code>apidiff</code> command line tool writes changesets from published release notes:</p>
<pre class="yaml" style="background:var(--code-bg);padding:1rem 1.25rem;border-radius:6px"><code>apidiff report https://docs.fwd.app/release-notes/api/2026/release.26.9.0/</code></pre>
<p>Source, binaries and issues are on <a href="https://github.com/gaberger/apidiff">GitHub</a>.</p>

<footer>Changeset format ${escapeHtml(version)}. This page is generated from <code>apidiffspec/api-changeset-schema.json</code> and the example files.</footer>
</main>
</div>
</body>
</html>
`;
}

export function loadSpec(root: string): { schema: Json; examples: Example[] } {
  const schema = JSON.parse(readFileSync(join(root, "api-changeset-schema.json"), "utf8"));
  const files = readdirSync(join(root, "examples"))
    .filter((f) => /\.(ya?ml|json)$/.test(f))
    .sort()
    .map((f) => `examples/${f}`);
  const examples = files.map((file) => ({ file, text: readFileSync(join(root, file), "utf8") }));
  return { schema, examples };
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..", "apidiffspec");
  const out = process.argv[2] ?? join(import.meta.dir, "..", "site-dist");
  const { schema, examples } = loadSpec(root);
  const html = renderSite(schema, examples);
  mkdirSync(join(out, "examples"), { recursive: true });
  await Bun.write(join(out, "index.html"), html);
  for (const f of ["api-changeset-schema.json", "example-changeset.yaml", ...examples.map((e) => e.file)]) {
    mkdirSync(dirname(join(out, f)), { recursive: true });
    copyFileSync(join(root, f), join(out, f));
  }
  console.log(`✓ wrote ${out}/index.html (${(html.length / 1024).toFixed(0)} KB) and ${examples.length + 2} spec files`);
}
