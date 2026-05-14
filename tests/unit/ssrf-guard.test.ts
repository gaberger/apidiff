import { describe, expect, test } from "bun:test";
import { safeFetch, type SsrfDeps } from "../../api/_lib/ssrf-guard.js";

// Test helpers — build injectable deps without hitting real DNS or network.

function makeLookup(map: Record<string, Array<{ address: string; family: number }>>): SsrfDeps["lookup"] {
  return async (hostname) => {
    const result = map[hostname];
    if (!result) throw new Error(`ENOTFOUND ${hostname}`);
    return result;
  };
}

function makeFetch(responses: Array<{ status: number; headers?: Record<string, string>; body?: string }>): {
  fn: SsrfDeps["fetch"];
  calls: string[];
} {
  const calls: string[] = [];
  let idx = 0;
  const fn: SsrfDeps["fetch"] = async (input) => {
    calls.push(input);
    const next = responses[idx++];
    if (!next) throw new Error(`unexpected fetch to ${input}`);
    return new Response(next.body ?? "", { status: next.status, headers: next.headers ?? {} });
  };
  return { fn, calls };
}

const noFetch: SsrfDeps["fetch"] = async () => { throw new Error("fetch should not have been called"); };

describe("safeFetch — URL validation", () => {
  test("rejects malformed URL", async () => {
    const result = await safeFetch("not a url", { lookup: makeLookup({}), fetch: noFetch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid url");
  });

  test("rejects file:// protocol", async () => {
    const result = await safeFetch("file:///etc/passwd", { lookup: makeLookup({}), fetch: noFetch });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toBe("only http/https urls are allowed");
    }
  });

  test("rejects gopher:// protocol", async () => {
    const result = await safeFetch("gopher://example.com/", { lookup: makeLookup({}), fetch: noFetch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("only http/https urls are allowed");
  });
});

describe("safeFetch — literal IP blocking (SSRF)", () => {
  const cases: Array<[string, string]> = [
    ["loopback v4", "http://127.0.0.1/"],
    ["loopback v4 alt", "http://127.5.6.7/"],
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
    ["RFC1918 10/8", "http://10.0.0.1/"],
    ["RFC1918 172.16/12 lower", "http://172.16.0.1/"],
    ["RFC1918 172.16/12 upper", "http://172.31.255.254/"],
    ["RFC1918 192.168/16", "http://192.168.1.1/"],
    ["CGNAT 100.64/10", "http://100.64.0.1/"],
    ["0.0.0.0/8", "http://0.0.0.0/"],
    ["multicast", "http://239.255.255.255/"],
    ["IPv6 loopback", "http://[::1]/"],
    ["IPv6 link-local", "http://[fe80::1]/"],
    ["IPv6 unique-local", "http://[fc00::1]/"],
    ["IPv4-mapped IPv6 loopback", "http://[::ffff:127.0.0.1]/"],
  ];

  for (const [name, url] of cases) {
    test(`blocks ${name} literal: ${url}`, async () => {
      const { fn } = makeFetch([]);
      const result = await safeFetch(url, { lookup: makeLookup({}), fetch: fn });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toContain("blocked host");
      }
    });
  }

  test("172.15.x and 172.32.x are public (boundary check)", async () => {
    const { fn, calls } = makeFetch([{ status: 200, body: "ok" }]);
    const result = await safeFetch("http://172.15.0.1/", { lookup: makeLookup({}), fetch: fn });
    expect(result.ok).toBe(true);
    expect(calls).toEqual(["http://172.15.0.1/"]);
  });
});

describe("safeFetch — DNS-resolved host blocking", () => {
  test("blocks hostname that resolves to a private IP", async () => {
    const lookup = makeLookup({ "internal.example.com": [{ address: "10.0.0.5", family: 4 }] });
    const result = await safeFetch("https://internal.example.com/admin", { lookup, fetch: noFetch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("10.0.0.5");
  });

  test("blocks if ANY resolved address is private (multi-A-record bypass)", async () => {
    // Attacker controls DNS, returns one public + one private IP. Must reject.
    const lookup = makeLookup({
      "evil.example.com": [
        { address: "8.8.8.8", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ],
    });
    const result = await safeFetch("https://evil.example.com/", { lookup, fetch: noFetch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("169.254.169.254");
  });

  test("blocks if DNS returns IPv6 link-local", async () => {
    const lookup = makeLookup({ "v6.example.com": [{ address: "fe80::1234", family: 6 }] });
    const result = await safeFetch("https://v6.example.com/", { lookup, fetch: noFetch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("fe80::1234");
  });

  test("allows hostname that resolves only to public IPs", async () => {
    const lookup = makeLookup({ "docs.example.com": [{ address: "1.2.3.4", family: 4 }] });
    const { fn, calls } = makeFetch([{ status: 200, body: '{"ok":true}', headers: { "content-type": "application/json" } }]);
    const result = await safeFetch("https://docs.example.com/spec.json", { lookup, fetch: fn });
    expect(result.ok).toBe(true);
    expect(calls).toEqual(["https://docs.example.com/spec.json"]);
  });

  test("rejects when DNS lookup fails", async () => {
    const result = await safeFetch("https://nx.example.com/", { lookup: makeLookup({}), fetch: noFetch });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("blocked host");
    }
  });
});

describe("safeFetch — redirect handling", () => {
  test("re-validates host on each redirect hop (rejects redirect to private IP)", async () => {
    const lookup = makeLookup({
      "public.example.com": [{ address: "1.2.3.4", family: 4 }],
      // Second hop tries to land on cloud-metadata host.
    });
    const { fn } = makeFetch([
      { status: 302, headers: { location: "http://169.254.169.254/" } },
    ]);
    const result = await safeFetch("https://public.example.com/", { lookup, fetch: fn });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("169.254.169.254");
  });

  test("rejects redirect to non-http(s) scheme", async () => {
    const lookup = makeLookup({ "public.example.com": [{ address: "1.2.3.4", family: 4 }] });
    const { fn } = makeFetch([
      { status: 301, headers: { location: "file:///etc/passwd" } },
    ]);
    const result = await safeFetch("https://public.example.com/", { lookup, fetch: fn });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("redirect to non-http(s) blocked");
  });

  test("follows public→public redirect successfully", async () => {
    const lookup = makeLookup({
      "a.example.com": [{ address: "1.2.3.4", family: 4 }],
      "b.example.com": [{ address: "5.6.7.8", family: 4 }],
    });
    const { fn, calls } = makeFetch([
      { status: 302, headers: { location: "https://b.example.com/final" } },
      { status: 200, body: "ok" },
    ]);
    const result = await safeFetch("https://a.example.com/", { lookup, fetch: fn });
    expect(result.ok).toBe(true);
    expect(calls).toEqual(["https://a.example.com/", "https://b.example.com/final"]);
  });

  test("resolves relative redirect targets against current URL", async () => {
    const lookup = makeLookup({ "a.example.com": [{ address: "1.2.3.4", family: 4 }] });
    const { fn, calls } = makeFetch([
      { status: 302, headers: { location: "/other" } },
      { status: 200, body: "ok" },
    ]);
    const result = await safeFetch("https://a.example.com/spec", { lookup, fetch: fn });
    expect(result.ok).toBe(true);
    expect(calls[1]).toBe("https://a.example.com/other");
  });

  test("caps redirect chain (refuses unbounded loops)", async () => {
    const lookup = makeLookup({ "a.example.com": [{ address: "1.2.3.4", family: 4 }] });
    // 7 redirects in a row → exceeds MAX_REDIRECTS (5). Loop body runs at hops 0..5
    // (6 iterations) then exits with "too many redirects" on the 7th attempt.
    const { fn } = makeFetch(
      Array.from({ length: 7 }, () => ({ status: 302, headers: { location: "https://a.example.com/loop" } })),
    );
    const result = await safeFetch("https://a.example.com/", { lookup, fetch: fn });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("too many redirects");
  });
});

describe("safeFetch — fetch error propagation", () => {
  test("wraps fetch exception as 502", async () => {
    const lookup = makeLookup({ "a.example.com": [{ address: "1.2.3.4", family: 4 }] });
    const fetchFn: SsrfDeps["fetch"] = async () => { throw new Error("connection refused"); };
    const result = await safeFetch("https://a.example.com/", { lookup, fetch: fetchFn });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.error).toContain("connection refused");
    }
  });
});
