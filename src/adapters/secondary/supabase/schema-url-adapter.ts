// Supabase-backed SchemaUrlRegistryPort. Mirrors the localStorage adapter's
// dedupe-by-url semantics (add() returns the existing row if url already
// present rather than throwing on unique-constraint violation).

import type { SchemaUrl, SchemaUrlDraft } from "../../../core/domain/types.js";
import type { SchemaUrlRegistryPort } from "../../../core/ports/index.js";
import { getSupabase } from "./client.js";

interface SchemaUrlRow {
  readonly id: string;
  readonly url: string;
  readonly label: string | null;
  readonly owner_integration_id: string | null;
  readonly added_at: string;
  readonly last_fetched_at: string | null;
}

function fromRow(r: SchemaUrlRow): SchemaUrl {
  const out: Record<string, unknown> = {
    id: r.id,
    url: r.url,
    addedAt: r.added_at,
  };
  if (r.label != null) out.label = r.label;
  if (r.owner_integration_id != null) out.ownerIntegrationId = r.owner_integration_id;
  if (r.last_fetched_at != null) out.lastFetchedAt = r.last_fetched_at;
  return out as unknown as SchemaUrl;
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class SupabaseSchemaUrlAdapter implements SchemaUrlRegistryPort {
  async list(): Promise<SchemaUrl[]> {
    const sb = getSupabase();
    if (!sb) return [];
    const { data, error } = await sb
      .from("schema_urls")
      .select("*")
      .order("added_at", { ascending: true });
    if (error) throw new Error(`schema_urls.list failed: ${error.message}`);
    return (data ?? []).map((row) => fromRow(row as SchemaUrlRow));
  }

  async add(draft: SchemaUrlDraft): Promise<SchemaUrl> {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase client not configured");
    const existing = await this.findByUrl(draft.url);
    if (existing) return existing;
    const row = {
      id: makeId(),
      url: draft.url,
      label: draft.label ?? null,
      owner_integration_id: draft.ownerIntegrationId ?? null,
    };
    const { data, error } = await sb
      .from("schema_urls")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(`schema_urls.add failed: ${error.message}`);
    return fromRow(data as SchemaUrlRow);
  }

  async remove(id: string): Promise<void> {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase client not configured");
    const { error } = await sb.from("schema_urls").delete().eq("id", id);
    if (error) throw new Error(`schema_urls.remove failed: ${error.message}`);
  }

  async findByUrl(url: string): Promise<SchemaUrl | null> {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from("schema_urls")
      .select("*")
      .eq("url", url)
      .maybeSingle();
    if (error) throw new Error(`schema_urls.findByUrl failed: ${error.message}`);
    return data ? fromRow(data as SchemaUrlRow) : null;
  }

  async touchFetched(url: string): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb
      .from("schema_urls")
      .update({ last_fetched_at: new Date().toISOString() })
      .eq("url", url);
    if (error) throw new Error(`schema_urls.touchFetched failed: ${error.message}`);
  }
}
