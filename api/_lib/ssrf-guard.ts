// Shared SSRF guard for the proxy-fetch endpoint (Vercel Function + Vite dev mirror).
// Composes pure rules (src/core/domain/ip-rules) with the I/O side-effects (DNS lookup
// + fetch). Pure predicates live in domain so they're hex-enforced and reusable; this
// module is the I/O orchestrator that hex treats as a Vercel-adjacent adapter shell.
//
// Behaviour: protocol allowlist, DNS resolution, private/loopback/link-local/metadata
// IP blocking on ALL resolved addresses, manual redirect handling with per-hop revalidation.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isAllowedProxyProtocol, isBlockedIp, isBlockedIPv4, isBlockedIPv6 } from "../../src/core/domain/ip-rules.js";

const MAX_REDIRECTS = 5;

export type GuardError =
  | { ok: false; status: 400; error: string }
  | { ok: false; status: 502; error: string };

export type GuardOk = { ok: true; response: Response };

// Injected deps (lookup + fetch) for testability — per ADR-014, mocks via deps pattern.
export type LookupFn = (hostname: string, options: { all: true }) => Promise<Array<{ address: string; family: number }>>;
// Structural fetch signature — narrower than `typeof fetch` so tests don't need to stub
// runtime extras (Bun's `preconnect`, etc).
export type FetchFn = (input: string, init: { redirect: "manual" }) => Promise<Response>;
export interface SsrfDeps { lookup: LookupFn; fetch: FetchFn }

const defaultDeps: SsrfDeps = { lookup, fetch };

async function isSafeHost(hostname: string, deps: SsrfDeps): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Literal IPs: validate directly without DNS.
  const literal = isIP(hostname);
  if (literal === 4) return isBlockedIPv4(hostname) ? { ok: false, reason: `blocked ipv4 ${hostname}` } : { ok: true };
  if (literal === 6) return isBlockedIPv6(hostname) ? { ok: false, reason: `blocked ipv6 ${hostname}` } : { ok: true };

  // Hostnames: resolve ALL addresses and reject if any is blocked (mitigates DNS rebinding
  // and multi-A-record bypasses).
  try {
    const addrs = await deps.lookup(hostname, { all: true });
    if (addrs.length === 0) return { ok: false, reason: `no DNS records for ${hostname}` };
    for (const a of addrs) {
      const fam: 4 | 6 | null = a.family === 4 ? 4 : a.family === 6 ? 6 : null;
      if (fam && isBlockedIp(fam, a.address)) return { ok: false, reason: `blocked ipv${fam} ${a.address}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "dns lookup failed";
    return { ok: false, reason: msg };
  }
}

// Performs a safe fetch: validates the URL, follows up to MAX_REDIRECTS hops,
// re-validating each Location header. Disables auto-redirect so the host check runs
// on every hop.
export async function safeFetch(rawUrl: string, deps: SsrfDeps = defaultDeps): Promise<GuardOk | GuardError> {
  let current: URL;
  try { current = new URL(rawUrl); } catch {
    return { ok: false, status: 400, error: "invalid url" };
  }
  if (!isAllowedProxyProtocol(current.protocol)) {
    return { ok: false, status: 400, error: "only http/https urls are allowed" };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safe = await isSafeHost(current.hostname, deps);
    if (!safe.ok) return { ok: false, status: 400, error: `blocked host: ${safe.reason}` };

    let response: Response;
    try {
      response = await deps.fetch(current.toString(), { redirect: "manual" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown fetch error";
      return { ok: false, status: 502, error: `upstream fetch failed: ${msg}` };
    }

    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get("location");
      if (!loc) return { ok: true, response };
      let next: URL;
      try { next = new URL(loc, current); } catch {
        return { ok: false, status: 502, error: "invalid redirect target" };
      }
      if (!isAllowedProxyProtocol(next.protocol)) {
        return { ok: false, status: 400, error: "redirect to non-http(s) blocked" };
      }
      current = next;
      continue;
    }

    return { ok: true, response };
  }

  return { ok: false, status: 502, error: "too many redirects" };
}
