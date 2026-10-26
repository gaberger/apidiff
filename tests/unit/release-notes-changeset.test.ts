import { describe, expect, test } from "bun:test";
import {
  buildChangeset,
  levenshtein,
  parseHtml,
  resolveHeading,
} from "../../src/core/domain/release-notes-changeset.js";

const page = (sections: string) =>
  `<h1>26.9.0 - Sep 25</h1><p>Released: 2026-09-25</p>${sections}`;

const item = (ticket: string, text: string, ops: string[] = [], label = "Affected operations:") =>
  `<li><strong>${ticket}</strong> ${text}${ops.length ? ` ${label}<ul>${ops.map((o) => `<li>${o}</li>`).join("")}</ul>` : ""}</li>`;

describe("levenshtein", () => {
  test("counts edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
  });
});

describe("resolveHeading", () => {
  test("matches known headings exactly", () => {
    expect(resolveHeading("Breaking changes")).toEqual({ bucket: "Breaking changes", via: "exact" });
    expect(resolveHeading("Non-breaking changes")).toEqual({ bucket: "Non-breaking changes", via: "exact" });
  });

  test("tolerates case, plurals and small typos", () => {
    expect(resolveHeading("Breaking Change")).toEqual({ bucket: "Breaking changes", via: "fuzzy" });
    expect(resolveHeading("Model chnages")).toEqual({ bucket: "Model changes", via: "fuzzy" });
  });

  test("never fuzzy-matches across a negation", () => {
    // 4 edits from "Breaking changes" — must not become breaking.
    for (const h of ["Non breaking change", "Nonbreaking changes", "Not breaking changes"]) {
      expect(resolveHeading(h)).toEqual({ bucket: "Non-breaking changes", via: "fuzzy" });
    }
    // Negated with no negated candidate nearby: unclassified, never "Breaking changes".
    expect(resolveHeading("No breaking changes in this release")).toBeNull();
  });

  test("rejects distant headings instead of guessing", () => {
    expect(resolveHeading("New endpoints")).toBeNull();
    expect(resolveHeading("Security fixes")).toBeNull();
  });

  test("uses aliases and ignores prose sections", () => {
    expect(resolveHeading("Deprecations")).toEqual({ bucket: "Scheduled breaking changes", via: "alias" });
    expect(resolveHeading("Appendix: How to use the Collector Tasks API")).toBe("ignore");
  });

  test("never returns Unclassified as a match", () => {
    expect(resolveHeading("Unclassified")).toBeNull();
  });
});

describe("parseHtml", () => {
  test("keeps items under Non-breaking changes (26.9.0 regression)", () => {
    const parsed = parseHtml(page(
      `<h2>Breaking changes</h2><p>None</p>` +
      `<h2>Non-breaking changes</h2><ul>${item("FWD-58044", "Adds a filter.", ["GET /api/networks/{networkId}/snapshots"])}</ul>`,
    ));
    expect(parsed.buckets.get("Non-breaking changes")).toHaveLength(1);
    expect(parsed.inexactHeadings).toEqual([]);
  });

  test("sends unknown h2 sections to Unclassified and reports them", () => {
    const parsed = parseHtml(page(`<h2>Security fixes</h2><ul>${item("FWD-1", "Patched.")}</ul>`));
    expect(parsed.buckets.get("Unclassified")).toHaveLength(1);
    expect(parsed.inexactHeadings).toEqual([
      { heading: "Security fixes", bucket: "Unclassified", via: "unclassified", itemCount: 1 },
    ]);
  });

  test("splits tickets grouped under a model name (26.8.0 layout)", () => {
    const parsed = parseHtml(page(
      `<h2>Model changes</h2><ul><li><p>ClassicDeviceType</p><ul>` +
      `<li><strong>FWDN-12653</strong> Added value "a"</li>` +
      `<li><strong>FWD-56077</strong> Added value "b"</li>` +
      `<li>Affected operations:<ul><li>GET /api/networks/{networkId}/devices</li></ul></li>` +
      `</ul></li></ul>`,
    ));
    const items = parsed.buckets.get("Model changes")!;
    expect(items.map((i) => i.title)).toEqual(["FWDN-12653", "FWD-56077"]);
    expect(items[1]!.description).toBe('ClassicDeviceType: Added value "b"');
    expect(items[1]!.affectedOps).toEqual(["GET /api/networks/{networkId}/devices"]);
  });

  test("splits tickets nested two levels deep and inherits outer operations", () => {
    const parsed = parseHtml(page(
      `<h2>Model changes</h2><ul><li><p>VendorOs</p><ul>` +
      `<li>Added 2 values:<ul><li><strong>FWDN-12633</strong> "a"</li><li><strong>FWDN-12644</strong> "b"</li></ul></li>` +
      `<li>Affected operations:<ul><li>GET /api/networks/{networkId}/devices</li></ul></li>` +
      `</ul></li></ul>`,
    ));
    const items = parsed.buckets.get("Model changes")!;
    expect(items.map((i) => i.title)).toEqual(["FWDN-12633", "FWDN-12644"]);
    expect(items[0]!.description).toBe('VendorOs: Added 2 values: "a"');
    expect(items[0]!.affectedOps).toEqual(["GET /api/networks/{networkId}/devices"]);
  });

  test("keeps every ticket in a multi-ticket title (26.10.0 layout)", () => {
    const parsed = parseHtml(page(
      `<h2>Breaking changes</h2><ul>${item("FWD-52020</strong>, <strong>FWD-52021", "Removed.", ["GET /api/a"])}</ul>`,
    ));
    const it = parsed.buckets.get("Breaking changes")![0]!;
    expect(it.title).toBe("FWD-52020, FWD-52021");
    expect(it.description).toBe("Removed. Affected operations:");
  });

  test("skips appendix steps and unknown sections with no items", () => {
    const parsed = parseHtml(page(
      `<h2>Appendix: Migrating</h2><ul><li><strong>Step</strong> Do this.</li></ul>` +
      `<h2>Overview</h2><p>No list here.</p>`,
    ));
    const total = [...parsed.buckets.values()].reduce((n, b) => n + b.length, 0);
    expect(total).toBe(0);
    expect(parsed.inexactHeadings).toEqual([]);
  });
});

describe("buildChangeset", () => {
  test("emits one linked entry per operation for in-place changes", () => {
    const parsed = parseHtml(page(
      `<h2>Scheduled breaking changes</h2><ul>${item("FWD-52020", "Removed in release 26.10.", [
        "GET /api/networks/{networkId}/collector/status",
        "POST /api/networks/{networkId}/startcollection",
      ], "Deprecated operations:")}</ul>`,
    ));
    const { changes } = buildChangeset(parsed, {});
    expect(changes.map((c) => c.at)).toEqual([
      "#/paths/~1api~1networks~1{networkId}~1collector~1status/get",
      "#/paths/~1api~1networks~1{networkId}~1startcollection/post",
    ]);
    expect(changes[0]!.related).toEqual(["CHG-002"]);
    expect(changes[1]!.related).toEqual(["CHG-001"]);
    expect(changes.every((c) => c.op === "deprecate" && c.lifecycle)).toBe(true);
  });

  test("single-operation entries carry no related field", () => {
    const parsed = parseHtml(page(
      `<h2>Model changes</h2><ul>${item("FWD-1", "Changed.", ["GET /api/a"])}</ul>`,
    ));
    expect(buildChangeset(parsed, {}).changes[0]!.related).toBeUndefined();
  });

  test("maps new operations inside Non-breaking changes as additions", () => {
    const parsed = parseHtml(page(
      `<h2>Non-breaking changes</h2><ul>${item("FWD-55569", "Added new operations.", [
        "GET /api/collector-tasks",
        "POST /api/collector-tasks/{taskId}",
      ], "New operations:")}</ul>`,
    ));
    const { changes } = buildChangeset(parsed, {});
    expect(changes).toHaveLength(1);
    expect(changes[0]!.op).toBe("add");
    expect(changes[0]!.to).toHaveLength(2);
  });
});
