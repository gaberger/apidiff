// localStorage-backed SchemaCachePort. 24h TTL, 3.5MB/entry cap, LRU
// eviction by fetched_at. Keyspace apidiff:spec:<hash>; same TTL + size
// limits as the deleted legacy spec-cache.js so existing browser caches
// remain readable after the port migration.

import type { CachedSchema, SchemaCacheStats } from "../../core/domain/types.js";
import type { SchemaCachePort } from "../../core/ports/index.js";

const KEY_PREFIX = "apidiff:spec:";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRY_BYTES = 3_500_000;

interface CacheEntry {
  readonly url: string;
  readonly fetched_at: number;
  readonly expires_at: number;
  readonly size_bytes: number;
  readonly content: string;
}

function hash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

function keyFor(url: string) { return KEY_PREFIX + hash(url); }

function safeGet(k: string): string | null {
  try { return window.localStorage.getItem(k); } catch { return null; }
}
function safeSet(k: string, v: string): boolean {
  try { window.localStorage.setItem(k, v); return true; } catch { return false; }
}
function safeRemove(k: string) {
  try { window.localStorage.removeItem(k); } catch { /* ignore */ }
}

function listEntries(): { key: string; fetched_at: number; size_bytes: number }[] {
  const out: { key: string; fetched_at: number; size_bytes: number }[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(KEY_PREFIX)) continue;
      const raw = safeGet(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as CacheEntry;
        out.push({ key: k, fetched_at: parsed.fetched_at ?? 0, size_bytes: parsed.size_bytes ?? raw.length });
      } catch { safeRemove(k); }
    }
  } catch { /* ignore */ }
  return out;
}

function evictOldestUntilFits(neededBytes: number): boolean {
  const entries = listEntries().sort((a, b) => a.fetched_at - b.fetched_at);
  let freed = 0;
  for (const e of entries) {
    if (freed >= neededBytes) return true;
    safeRemove(e.key);
    freed += e.size_bytes;
  }
  return freed >= neededBytes;
}

export class LocalStorageSchemaCacheAdapter implements SchemaCachePort {
  async get(url: string): Promise<CachedSchema | null> {
    const raw = safeGet(keyFor(url));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as CacheEntry;
      if (!parsed.content) return null;
      if (parsed.expires_at && Date.now() > parsed.expires_at) {
        safeRemove(keyFor(url));
        return null;
      }
      return {
        url,
        content: parsed.content,
        fetchedAt: parsed.fetched_at ?? 0,
        expiresAt: parsed.expires_at ?? Date.now() + TTL_MS,
        sizeBytes: parsed.size_bytes ?? parsed.content.length,
      };
    } catch {
      safeRemove(keyFor(url));
      return null;
    }
  }

  async put(url: string, content: string): Promise<boolean> {
    if (typeof content !== "string") return false;
    const size_bytes = content.length;
    if (size_bytes > MAX_ENTRY_BYTES) return false;

    const now = Date.now();
    const entry = JSON.stringify({
      url, fetched_at: now, expires_at: now + TTL_MS, size_bytes, content,
    } satisfies CacheEntry);

    if (safeSet(keyFor(url), entry)) return true;
    if (evictOldestUntilFits(entry.length) && safeSet(keyFor(url), entry)) return true;
    return false;
  }

  async invalidate(url: string): Promise<void> {
    safeRemove(keyFor(url));
  }

  async purge(): Promise<SchemaCacheStats & { freedBytes: number }> {
    const entries = listEntries();
    let freedBytes = 0;
    for (const e of entries) { freedBytes += e.size_bytes; safeRemove(e.key); }
    return { count: entries.length, totalBytes: 0, freedBytes };
  }

  async stats(): Promise<SchemaCacheStats> {
    const entries = listEntries();
    return { count: entries.length, totalBytes: entries.reduce((n, e) => n + e.size_bytes, 0) };
  }
}
