import { describe, expect, test } from "bun:test";
import { decodeEntities, parseHtmlTree, textOf } from "../../src/core/domain/html-tree.js";
import { extractIds, extractOps, segmentReleaseNotes } from "../../src/core/domain/release-notes-segment.js";

const titles = (html: string) => segmentReleaseNotes(html).segments.map((s) => s.title);

describe("parseHtmlTree", () => {
  test("closes implicit <p> and <li>", () => {
    const root = parseHtmlTree("<ul><li>one<li>two</ul><p>a<p>b");
    expect(textOf(root)).toBe("one two a b");
    const ul = root.children[0] as { children: unknown[] };
    expect(ul.children).toHaveLength(2);
  });

  test("keeps raw text out of visible text and survives stray closes", () => {
    expect(textOf(parseHtmlTree("<div>x<script>if (a<b) {}</script></span>y</div>"))).toBe("xy");
  });

  test("decodes entities", () => {
    expect(decodeEntities("A &amp; B &#8594; &#x2014; &rsquo;")).toBe("A & B → — ’");
  });
});

describe("extractIds / extractOps", () => {
  test("finds tickets, CVEs and issue refs but not standards", () => {
    expect(extractIds("FWD-123 OKTA-98765 CVE-2025-12345 #19002 SHA-256 ISO-8601 &#123")).toEqual([
      "FWD-123", "OKTA-98765", "CVE-2025-12345", "#19002",
    ]);
  });

  test("finds operations and trims trailing punctuation", () => {
    expect(extractOps("Use GET /api/a/{id}. Then POST /api/b:")).toEqual(["GET /api/a/{id}", "POST /api/b"]);
  });
});

describe("segmentReleaseNotes", () => {
  test("list sections: each top-level <li> is an item, nested lists stay inside", () => {
    const r = segmentReleaseNotes(
      `<main><h2>2026-10-21</h2><ul><li>Added X<ul><li>GET /x</li></ul></li><li>Fixed Y</li></ul></main>`,
    );
    expect(r.segments.map((s) => [s.title, s.trail, s.shape])).toEqual([
      ["Added X GET /x", ["2026-10-21"], "list-item"],
      ["Fixed Y", ["2026-10-21"], "list-item"],
    ]);
    expect(r.segments[0]!.date).toBe("2026-10-21");
  });

  test("prose sections: a heading that opens with prose is one item, lists inside are details", () => {
    const prose = "What's changing: ".padEnd(200, "x") + ".";
    const r = segmentReleaseNotes(`<main><h4>Added new policy APIs</h4><p>${prose}</p><ul><li>GET /a</li><li>GET /b</li></ul></main>`);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]!.shape).toBe("section");
    expect(r.segments[0]!.title).toBe("Added new policy APIs");
    expect(r.segments[0]!.ops).toEqual(["GET /a", "GET /b"]);
  });

  test("short intros ending in ':' do not turn a list section into prose", () => {
    expect(titles(`<main><h4>June 30</h4><p>New features include:</p><ul><li>A.</li><li>B.</li></ul></main>`)).toEqual(["A.", "B."]);
  });

  test("skips furniture headings, empty sections and nav, without losing real content", () => {
    const html =
      `<html class="show-table-of-contents"><body><nav><ul><li>Home</li></ul></nav>` +
      `<main><h2>In this article</h2><ul><li>Link</li></ul>` +
      `<h2 class="anchor anchorTargetStickyNavbar">Breaking changes</h2><p>None</p>` +
      `<h2 class="anchorTargetStickyNavbar">Non-breaking changes</h2><ul><li><strong>FWD-52020</strong> Added.</li></ul></main></body></html>`;
    const r = segmentReleaseNotes(html);
    expect(r.segments.map((s) => [s.trail, s.title])).toEqual([[["Non-breaking changes"], "FWD-52020"]]);
  });

  test("feed pages: each <article> is segmented on its own", () => {
    const post = (t: string) => `<article><header><h2>${t}</h2><time datetime="2026-10-13T00:00:00Z">Oct 13</time></header><ul><li>${t} change</li></ul></article>`;
    const r = segmentReleaseNotes(`<main>${post("A")}${post("B")}${post("C")}</main>`);
    expect(r.feedPosts).toBe(3);
    expect(r.segments.map((s) => [s.trail[0], s.date])).toEqual([["A", "2026-10-13"], ["B", "2026-10-13"], ["C", "2026-10-13"]]);
  });

  test("a run of sibling link cards is a list and keeps each href", () => {
    const card = (h: string) => `<a href="/changelog/${h}"><div>${h} title</div><div>Billing</div></a>`;
    const r = segmentReleaseNotes(`<article><h4>Billing</h4><div>${card("one")}${card("two")}</div></article>`);
    expect(r.segments.map((s) => s.links)).toEqual([["/changelog/one"], ["/changelog/two"]]);
  });

  test("headings wrapped in <span> are still headings", () => {
    const r = segmentReleaseNotes(`<div><span><h2>16 October 2026</h2></span><span><h4>Added thing</h4><p>${"x".repeat(200)}</p></span></div>`);
    expect(r.segments[0]!.trail).toEqual(["16 October 2026", "Added thing"]);
  });

  test("splits label entries into one item per ticket and shares their operations", () => {
    const r = segmentReleaseNotes(
      `<main><h2>Model changes</h2><ul><li><p>VendorOs</p><ul>` +
      `<li>Added 2 values:<ul><li><strong>FWDN-12633</strong> "a"</li><li><strong>FWDN-12644</strong> "b"</li></ul></li>` +
      `<li>Affected operations:<ul><li>GET /api/devices</li></ul></li></ul></li></ul></main>`,
    );
    expect(r.segments.map((s) => [s.ids, s.trail, s.ops])).toEqual([
      [["FWDN-12633"], ["Model changes", "VendorOs", "Added 2 values:"], ["GET /api/devices"]],
      [["FWDN-12644"], ["Model changes", "VendorOs", "Added 2 values:"], ["GET /api/devices"]],
    ]);
  });

  test("keeps one item when one change is filed under two tickets", () => {
    const r = segmentReleaseNotes(`<main><h2>Breaking changes</h2><ul><li><strong>FWD-52020</strong>, <strong>FWD-52021</strong> Removed.</li></ul></main>`);
    expect(r.segments.map((s) => s.ids)).toEqual([["FWD-52020", "FWD-52021"]]);
  });

  test("never drops anchored content: code samples and non-leaf intros with IDs are kept", () => {
    const r = segmentReleaseNotes(
      `<main><h2>Appendix</h2><p>See OKTA-512345 for context.</p><h3>Step</h3><ul><li>Do it</li></ul><pre><code>GET /api/x/123</code></pre>` +
      `<h2>Other</h2><p>Intro with nothing to anchor.</p><h3>Sub</h3><ul><li>Item</li></ul></main>`,
    );
    expect(r.audit.missingIds).toEqual([]);
    expect(r.audit.missingOps).toEqual([]);
    expect(r.segments.some((s) => s.text.includes("Intro with nothing"))).toBe(false);
  });

  test("audit reports IDs and operations that no item carries", () => {
    // A <table> in a non-leaf section with no anchors is dropped; with anchors it is kept.
    const r = segmentReleaseNotes(`<main><h2>Release</h2><table><tr><td>Summary</td></tr></table><h3>Feature</h3><ul><li>FWD-58049</li></ul></main>`);
    expect(r.audit).toEqual({ pageIds: ["FWD-58049"], missingIds: [], pageOps: [], missingOps: [] });
  });
});
