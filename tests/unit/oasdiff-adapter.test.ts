import { describe, expect, test } from "bun:test";
import { countOasdiffLevels } from "../../src/adapters/secondary/oasdiff-adapter.js";

// Shapes copied from oasdiff 1.13 `changelog --format text` on Forward 26.3 → 26.4 and 26.8 → 26.9.
const entry = (level: string, id: string, detail = "something changed") =>
  `${level}\t[${id}] at /tmp/apidiff-revision-1.json\t\n\tin API GET /networks\n\t\t${detail}\n\n`;

describe("countOasdiffLevels", () => {
  test("counts error entries as breaking (Forward 26.3 → 26.4 shape)", () => {
    const text =
      "4 changes: 2 error, 1 warning, 1 info\n" +
      entry("error", "response-property-type-changed") +
      entry("error", "response-required-property-removed") +
      entry("warning", "response-optional-property-removed") +
      entry("info", "new-optional-request-parameter");
    expect(countOasdiffLevels(text)).toEqual({ breaking: 2, deprecated: 0, nonBreaking: 2 });
  });

  test("counts deprecations separately from other non-breaking changes", () => {
    const text = entry("info", "endpoint-deprecated") + entry("warning", "response-property-enum-value-added");
    expect(countOasdiffLevels(text)).toEqual({ breaking: 0, deprecated: 1, nonBreaking: 1 });
  });

  test("an error-level deprecation check still counts as breaking", () => {
    expect(countOasdiffLevels(entry("error", "api-removed-before-sunset")).breaking).toBe(1);
    expect(countOasdiffLevels(entry("error", "endpoint-deprecated-removed")).breaking).toBe(1);
  });

  test("falls back to the header total if entry lines change shape", () => {
    const text = "80 changes: 12 error, 58 warning, 10 info\nERROR something in a new format\n";
    expect(countOasdiffLevels(text).breaking).toBe(12);
  });

  test("does not count the old bracket tags the parser used to look for", () => {
    // The previous parser matched "[breaking]"; oasdiff never prints it, so every count was 0.
    expect(countOasdiffLevels("[breaking] [deprecated] [added]")).toEqual({ breaking: 0, deprecated: 0, nonBreaking: 0 });
  });

  test("no changes", () => {
    expect(countOasdiffLevels("")).toEqual({ breaking: 0, deprecated: 0, nonBreaking: 0 });
  });
});
