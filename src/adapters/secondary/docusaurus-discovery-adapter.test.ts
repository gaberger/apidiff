import { describe, expect, test } from "bun:test";
import { DocusaurusDiscoveryAdapter } from "./docusaurus-discovery-adapter.js";
import type { SpecSource } from "../../core/domain/discovery-types.js";

function makeFetch(responses: Map<string, { ok: boolean; body?: unknown }>): typeof fetch {
  // Cast: the adapter only calls fetch(url, init) — typeof fetch in recent
  // @types/node adds a `preconnect` method on the function object that's
  // irrelevant to a test stub. Easier to cast than to ship an inert stub.
  const impl = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const r = responses.get(url);
    if (!r) return new Response(null, { status: 404 });
    if (!r.ok) return new Response(null, { status: 404 });
    if (r.body !== undefined) return new Response(JSON.stringify(r.body), { status: 200 });
    return new Response(null, { status: 200 });
  };
  return impl as unknown as typeof fetch;
}

describe("DocusaurusDiscoveryAdapter", () => {
  const source: SpecSource = { kind: "docusaurus", baseUrl: "https://docs.example.com" };

  test("returns empty when versions.json 404s", async () => {
    const adapter = new DocusaurusDiscoveryAdapter(makeFetch(new Map()));
    const result = await adapter.discover(source);
    expect(result).toEqual([]);
  });

  test("probes every version × known section and keeps only 200 responses", async () => {
    const responses = new Map<string, { ok: boolean; body?: unknown }>([
      ["https://docs.example.com/versions.json", { ok: true, body: { versions: ["26.3", "26.2", "25.12"] } }],
      // 26.3 publishes complete + checks
      ["https://docs.example.com/26.3/api/spec/complete.json", { ok: true }],
      ["https://docs.example.com/26.3/api/spec/checks.json", { ok: true }],
      // 26.2 publishes complete only
      ["https://docs.example.com/26.2/api/spec/complete.json", { ok: true }],
      // 25.12 publishes nothing
    ]);
    const adapter = new DocusaurusDiscoveryAdapter(makeFetch(responses));
    const result = await adapter.discover(source);

    const urls = result.map((v) => v.url).sort();
    expect(urls).toEqual([
      "https://docs.example.com/26.2/api/spec/complete.json",
      "https://docs.example.com/26.3/api/spec/checks.json",
      "https://docs.example.com/26.3/api/spec/complete.json",
    ]);
  });

  test("labels include version and section name", async () => {
    const responses = new Map<string, { ok: boolean; body?: unknown }>([
      ["https://docs.example.com/versions.json", { ok: true, body: { versions: ["26.3"] } }],
      ["https://docs.example.com/26.3/api/spec/complete.json", { ok: true }],
      ["https://docs.example.com/26.3/api/spec/nqe.json", { ok: true }],
    ]);
    const adapter = new DocusaurusDiscoveryAdapter(makeFetch(responses));
    const result = await adapter.discover(source);
    const labels = result.map((v) => v.label).sort();
    expect(labels).toEqual(["v26.3 · Complete", "v26.3 · NQE"]);
  });

  test("merges versions + baseVersions without duplicates", async () => {
    const responses = new Map<string, { ok: boolean; body?: unknown }>([
      ["https://docs.example.com/versions.json", { ok: true, body: { versions: ["26.3"], baseVersions: ["26.3", "16.3.0"] } }],
      ["https://docs.example.com/26.3/api/spec/complete.json", { ok: true }],
      ["https://docs.example.com/16.3.0/api/spec/complete.json", { ok: true }],
    ]);
    const adapter = new DocusaurusDiscoveryAdapter(makeFetch(responses));
    const result = await adapter.discover(source);
    const versions = new Set(result.map((v) => v.version));
    expect(versions).toEqual(new Set(["26.3", "16.3.0"]));
  });

  test("throws on wrong source kind", async () => {
    const adapter = new DocusaurusDiscoveryAdapter(makeFetch(new Map()));
    await expect(
      adapter.discover({ kind: "url", specUrls: [] } as SpecSource),
    ).rejects.toThrow(/cannot handle source kind/);
  });
});
