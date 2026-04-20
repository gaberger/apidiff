// Supabase-backed SchemaCachePort. Same TTL + size-cap semantics as the
// localStorage adapter (24h TTL, ~3.5MB per entry). Eviction is done
// opportunistically on get() via an expires_at comparison, not on a cron —
// writes never block on cleanup.

import type { CachedSchema, SchemaCacheStats } from "../../../core/domain/types.js";
import type { SchemaCachePort } from "../../../core/ports/index.js";
import { getSupabase } from "./client.js";

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRY_BYTES = 3_500_000;

interface CacheRow {
  readonly url: string;
  readonly content: string;
  readonly fetched_at: number;
  readonly expires_at: number;
  readonly size_bytes: number;
}

function fromRow(r: CacheRow): CachedSchema {
  return {
    url: r.url,
    content: r.content,
    fetchedAt: r.fetched_at,
    expiresAt: r.expires_at,
    sizeBytes: r.size_bytes,
  };
}

export class SupabaseSchemaCacheAdapter implements SchemaCachePort {
  async get(url: string): Promise<CachedSchema | null> {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from("schema_cache")
      .select("*")
      .eq("url", url)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as CacheRow;
    if (Date.now() > row.expires_at) {
      // Lazy expiry: fire-and-forget deletion, return null.
      void sb.from("schema_cache").delete().eq("url", url);
      return null;
    }
    return fromRow(row);
  }

  async put(url: string, content: string): Promise<boolean> {
    if (typeof content !== "string") return false;
    const size_bytes = content.length;
    if (size_bytes > MAX_ENTRY_BYTES) return false;
    const sb = getSupabase();
    if (!sb) return false;
    const now = Date.now();
    const row: CacheRow = {
      url,
      content,
      fetched_at: now,
      expires_at: now + TTL_MS,
      size_bytes,
    };
    const { error } = await sb.from("schema_cache").upsert(row, { onConflict: "url" });
    return !error;
  }

  async invalidate(url: string): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("schema_cache").delete().eq("url", url);
  }

  async purge(): Promise<SchemaCacheStats & { freedBytes: number }> {
    const sb = getSupabase();
    if (!sb) return { count: 0, totalBytes: 0, freedBytes: 0 };
    const stats = await this.stats();
    const { error } = await sb.from("schema_cache").delete().neq("url", "");
    if (error) throw new Error(`schema_cache.purge failed: ${error.message}`);
    return { count: stats.count, totalBytes: 0, freedBytes: stats.totalBytes };
  }

  async stats(): Promise<SchemaCacheStats> {
    const sb = getSupabase();
    if (!sb) return { count: 0, totalBytes: 0 };
    const { data, error } = await sb.from("schema_cache").select("size_bytes");
    if (error) throw new Error(`schema_cache.stats failed: ${error.message}`);
    const rows = (data ?? []) as { size_bytes: number }[];
    return {
      count: rows.length,
      totalBytes: rows.reduce((n, r) => n + (r.size_bytes ?? 0), 0),
    };
  }
}
