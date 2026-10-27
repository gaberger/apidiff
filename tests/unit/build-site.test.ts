import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  escapeHtml,
  highlightYaml,
  loadSpec,
  operations,
  renderSite,
} from "../../scripts/build-site.js";

const ROOT = join(import.meta.dir, "..", "..", "apidiffspec");
const { schema, examples } = loadSpec(ROOT);
const html = renderSite(schema, examples);

describe("spec site", () => {
  test("lists every operation in the schema, each with a family", () => {
    const ops = operations(schema);
    expect(ops.length).toBe(schema.$defs.operation.oneOf.length);
    for (const op of ops) expect(html).toContain(`<code class="op">${op.name}</code>`);
    expect(new Set(ops.map((o) => o.family))).toEqual(
      new Set(["structural", "constraint", "semantic", "lifecycle"]),
    );
  });

  test("marks semantic operations as author-only", () => {
    const resem = operations(schema).find((o) => o.name === "resemanticize")!;
    expect(resem.note).toBe("author-only");
    expect(resem.description.startsWith("Same shape")).toBe(true);
  });

  test("lists every target kind", () => {
    for (const t of schema.$defs.target_kind.enum) expect(html).toContain(`<li><code>${t}</code></li>`);
  });

  test("includes and links every example file", () => {
    expect(examples.length).toBeGreaterThanOrEqual(5);
    for (const ex of examples) {
      expect(html).toContain(`href="${ex.file}" download`);
      expect(html).toContain(`<summary>Show <code>${ex.file}</code></summary>`);
    }
  });

  test("hero keeps the payload exactly as written (12.50, not 12.5)", () => {
    expect(html).toContain("Payload before</span><pre><code>{ amount: 12.50 }</code>");
    expect(html).toContain("Payload after</span><pre><code>{ amount: 1250 }</code>");
  });

  test("an unknown family prefix fails the build instead of guessing", () => {
    const bad = structuredClone(schema);
    bad.$defs.operation.oneOf.push({ const: "teleport", description: "Magic. Moves things." });
    expect(() => operations(bad)).toThrow(/teleport/);
  });

  test("escapes HTML from the schema and examples", () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe(
      "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;",
    );
    const out = highlightYaml(`description: <img src=x onerror=alert(1)> # <b>`);
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<b>");
    expect(out).toContain('<span class="y-key">description</span>');
    expect(out).toContain('<span class="y-com"># &lt;b&gt;</span>');
  });

  test("a # inside a quoted pointer is not treated as a comment", () => {
    const out = highlightYaml(`  at: "#/components/schemas/Order"`);
    expect(out).toContain('<span class="y-str">&quot;#/components/schemas/Order&quot;</span>');
    expect(out).not.toContain("y-com");
  });
});
