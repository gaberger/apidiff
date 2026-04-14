import { describe, expect, test } from "bun:test";
import { extractProduct, groupByProduct } from "../../src/core/domain/product-extractor.js";

describe("extractProduct", () => {
  test("GitHub: groups api.github.com variants by deployment, not by date", () => {
    const urls = [
      "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.2022-11-28.json",
      "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.2026-03-10.json",
    ];
    const p1 = extractProduct(urls[0], "api.github.com.2022-11-28", "github");
    const p2 = extractProduct(urls[1], "api.github.com.2026-03-10", "github");
    expect(p1?.key).toBe("api.github.com");
    expect(p2?.key).toBe("api.github.com");
    expect(p1?.key).toBe(p2?.key);
  });

  test("GitHub: works even when slug is not exactly 'github'", () => {
    const url = "https://example.com/rest-api-description/descriptions/api.github.com/api.github.com.2022-11-28.json";
    const p = extractProduct(url, "2022-11-28", "github-rest-api");
    expect(p?.key).toBe("api.github.com");
  });

  test("Generic: ISO-date directory names are NOT treated as products", () => {
    const url = "https://example.com/specs/2022-11-28/openapi.json";
    const p = extractProduct(url, "2022-11-28", "mystery-provider");
    expect(p).toBeUndefined();
  });

  test("Generic: vN and semver directory names are NOT treated as products", () => {
    const url1 = "https://example.com/v2/openapi.json";
    const url2 = "https://example.com/1.2.3/openapi.json";
    expect(extractProduct(url1, "v2", "custom")).toBeUndefined();
    expect(extractProduct(url2, "1.2.3", "custom")).toBeUndefined();
  });

  test("Generic: bare year directories are NOT treated as products", () => {
    const url = "https://example.com/2024/api.yaml";
    expect(extractProduct(url, "2024", "custom")).toBeUndefined();
  });

  test("Generic: release channel dirnames are NOT products (latest, preview, stable, edge, main)", () => {
    const channels = ["latest", "preview", "stable", "edge", "main", "next", "beta", "rc", "nightly", "canary"];
    for (const ch of channels) {
      const url = `https://example.com/${ch}/openapi.json`;
      expect(extractProduct(url, ch, "custom")).toBeUndefined();
    }
  });
});

describe("groupByProduct for GitHub date-versioned specs", () => {
  test("collapses multiple dates under one api.github.com group (regression)", () => {
    const versions = [
      { url: "https://x/descriptions/api.github.com/api.github.com.2022-11-28.json", label: "2022-11-28" },
      { url: "https://x/descriptions/api.github.com/api.github.com.2023-04-22.json", label: "2023-04-22" },
      { url: "https://x/descriptions/api.github.com/api.github.com.2026-03-10.json", label: "2026-03-10" },
    ];
    const groups = groupByProduct(versions, "github");
    expect(groups).toHaveLength(1);
    expect(groups[0].versions).toHaveLength(3);
  });
});
