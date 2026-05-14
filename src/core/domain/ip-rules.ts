// Pure predicates for IP-range and URL-protocol validation.
// No I/O, no Node built-ins — safe to import from any layer.
// Used by the SSRF guard (api/_lib/ssrf-guard.ts) to gate proxied fetches.

// IPv4 ranges that must never be reached through a server-side proxy:
// loopback, RFC1918 private, link-local / cloud metadata, CGNAT, multicast,
// reserved. Returns true when `ip` is malformed, on the principle that
// unparseable input must not be treated as a public address.
export function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;                         // 10.0.0.0/8
  if (a === 127) return true;                        // loopback
  if (a === 0) return true;                          // 0.0.0.0/8
  if (a === 169 && b === 254) return true;           // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
  if (a === 192 && b === 168) return true;           // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true;                         // multicast + reserved
  return false;
}

export function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::" || lower === "::ffff:0:0") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;        // unique local
  if (lower.startsWith("ff")) return true;                                  // multicast
  // IPv4-mapped IPv6: ::ffff:a.b.c.d — defer to v4 rules on the embedded address.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped && mapped[1]) return isBlockedIPv4(mapped[1]);
  return false;
}

// Family-agnostic helper for callers that already know the IP family.
export function isBlockedIp(family: 4 | 6, address: string): boolean {
  return family === 4 ? isBlockedIPv4(address) : isBlockedIPv6(address);
}

// Only http/https URLs are eligible for server-side proxying. file://, gopher://,
// data:, ftp:, etc are rejected.
export function isAllowedProxyProtocol(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:";
}
