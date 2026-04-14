/* eslint-disable */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// SSRF guards: only allow https fetches to non-private hosts.
// NOTE: does not defend against DNS rebinding (hostname → private IP at
// resolve-time). A follow-up hardening would be to resolve via Deno.resolveDns
// and re-check the resolved addresses; out of scope for this change.

const ALLOWED_SCHEMES = new Set(['https:']);

// IPv4 literal: 4 decimal octets 0-255 separated by dots.
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;

function isIpv4Literal(host: string): boolean {
  return IPV4_RE.test(host);
}

function isIpv6Literal(host: string): boolean {
  // URL.hostname wraps IPv6 literals in brackets; strip them to test.
  const stripped = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  return stripped.includes(':') && /^[0-9a-f:]+$/i.test(stripped);
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;                              // 10.0.0.0/8
  if (a === 127) return true;                             // loopback
  if (a === 169 && b === 254) return true;                // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;       // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                // 192.168.0.0/16
  if (a === 0) return true;                               // 0.0.0.0/8
  if (a >= 224) return true;                              // multicast + reserved
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const stripped = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const lower = stripped.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:')) return true;             // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
  if (lower.startsWith('ff')) return true;                // multicast
  const v4Match = lower.match(/::ffff:([\d.]+)$/);
  if (v4Match && isPrivateIpv4(v4Match[1])) return true;
  return false;
}

const DISALLOWED_HOSTS = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
]);

function validateUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return { ok: false, reason: `scheme ${url.protocol} not allowed — https only` };
  }
  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, reason: 'empty host' };
  if (DISALLOWED_HOSTS.has(host)) return { ok: false, reason: `host ${host} blocked` };
  if (host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, reason: `host suffix ${host} blocked` };
  }
  if (isIpv4Literal(host) && isPrivateIpv4(host)) {
    return { ok: false, reason: `private IPv4 ${host} blocked` };
  }
  if (isIpv6Literal(host) && isPrivateIpv6(host)) {
    return { ok: false, reason: `private IPv6 ${host} blocked` };
  }
  return { ok: true, url };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const { url: rawUrl } = await req.json();
  if (!rawUrl || typeof rawUrl !== 'string') {
    return Response.json({ error: 'url is required' }, { status: 400 });
  }

  // Convert GitHub blob URLs to raw URLs
  const normalized = rawUrl
    .replace('https://github.com/', 'https://raw.githubusercontent.com/')
    .replace('/blob/', '/');

  const validation = validateUrl(normalized);
  if (!validation.ok) {
    return Response.json({ error: `URL rejected: ${validation.reason}` }, { status: 400 });
  }
  const url = validation.url.toString();

  const ghToken = Deno.env.get('GITHUB_TOKEN');
  const headers: Record<string, string> = {
    'Accept': 'application/json, */*',
    'User-Agent': 'Mozilla/5.0 apidiff/1.0',
  };
  // Only attach GitHub token when the VALIDATED hostname is exactly the raw
  // content host — the pre-validation substring check could be spoofed by a
  // path or query segment containing that string.
  if (ghToken && validation.url.hostname === 'raw.githubusercontent.com') {
    headers['Authorization'] = `token ${ghToken}`;
  }

  // Refuse to follow redirects — a 3xx could point at a private host and
  // default `redirect: 'follow'` would bypass our allowlist.
  const res = await fetch(url, { headers, redirect: 'manual' });

  if (res.status >= 300 && res.status < 400) {
    return Response.json({ error: `URL returned redirect ${res.status}; redirects are not followed` }, { status: 502 });
  }

  if (!res.ok) {
    return Response.json({ error: `HTTP ${res.status} ${res.statusText}` }, { status: 502 });
  }

  const text = await res.text();
  if (!text.trim()) {
    return Response.json({ error: 'Empty response from server' }, { status: 502 });
  }

  // Check for HTML error pages
  if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) {
    return Response.json({ error: 'URL returned an HTML page, not a JSON/YAML spec' }, { status: 502 });
  }

  // Determine format
  let isJson = false;
  try { JSON.parse(text); isJson = true; } catch {}

  // Stream raw text back wrapped minimally to avoid double-serialization of huge specs
  const wrapper = isJson
    ? `{"document":${text}}`
    : JSON.stringify({ document: text, format: 'yaml' });

  return new Response(wrapper, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
