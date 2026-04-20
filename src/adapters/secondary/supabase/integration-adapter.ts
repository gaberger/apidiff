// Supabase-backed IntegrationStoragePort. Column names are snake_case in
// Postgres; this adapter is the translation boundary to the camelCase
// domain type Integration.

import type { Integration, IntegrationDraft } from "../../../core/domain/types.js";
import type { IntegrationStoragePort } from "../../../core/ports/index.js";
import { getSupabase } from "./client.js";

interface IntegrationRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string | null;
  readonly category: string | null;
  readonly color: string | null;
  readonly logo_url: string | null;
  readonly base_url: string | null;
  readonly changelog_url: string | null;
  readonly versions: Integration["versions"] | null;
  readonly comparisons: Integration["comparisons"] | null;
}

function fromRow(r: IntegrationRow): Integration {
  const out: Record<string, unknown> = { id: r.id, name: r.name };
  if (r.slug != null) out.slug = r.slug;
  if (r.category != null) out.category = r.category;
  if (r.color != null) out.color = r.color;
  if (r.logo_url != null) out.logo_url = r.logo_url;
  if (r.base_url != null) out.base_url = r.base_url;
  if (r.changelog_url != null) out.changelog_url = r.changelog_url;
  if (r.versions) out.versions = r.versions;
  if (r.comparisons) out.comparisons = r.comparisons;
  return out as unknown as Integration;
}

function toRow(i: Integration | IntegrationDraft): Omit<IntegrationRow, "id"> & { id?: string } {
  return {
    ...("id" in i ? { id: i.id } : {}),
    name: i.name,
    slug: i.slug ?? null,
    category: i.category ?? null,
    color: i.color ?? null,
    logo_url: i.logo_url ?? null,
    base_url: i.base_url ?? null,
    changelog_url: i.changelog_url ?? null,
    versions: (i.versions as IntegrationRow["versions"]) ?? null,
    comparisons: (i.comparisons as IntegrationRow["comparisons"]) ?? null,
  };
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `intg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class SupabaseIntegrationAdapter implements IntegrationStoragePort {
  async list(): Promise<Integration[]> {
    const sb = getSupabase();
    if (!sb) return [];
    const { data, error } = await sb
      .from("integrations")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(`integrations.list failed: ${error.message}`);
    return (data ?? []).map((row) => fromRow(row as IntegrationRow));
  }

  async create(draft: IntegrationDraft): Promise<Integration> {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase client not configured");
    const id = makeId();
    const row = { ...toRow(draft), id };
    const { data, error } = await sb
      .from("integrations")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(`integrations.create failed: ${error.message}`);
    return fromRow(data as IntegrationRow);
  }

  async update(id: string, patch: Partial<Integration>): Promise<Integration> {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase client not configured");
    // Translate only the fields present in `patch` to snake_case row shape.
    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.slug !== undefined) updates.slug = patch.slug ?? null;
    if (patch.category !== undefined) updates.category = patch.category ?? null;
    if (patch.color !== undefined) updates.color = patch.color ?? null;
    if (patch.logo_url !== undefined) updates.logo_url = patch.logo_url ?? null;
    if (patch.base_url !== undefined) updates.base_url = patch.base_url ?? null;
    if (patch.changelog_url !== undefined) updates.changelog_url = patch.changelog_url ?? null;
    if (patch.versions !== undefined) updates.versions = patch.versions ?? null;
    if (patch.comparisons !== undefined) updates.comparisons = patch.comparisons ?? null;

    const { data, error } = await sb
      .from("integrations")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`integrations.update failed: ${error.message}`);
    return fromRow(data as IntegrationRow);
  }

  async delete(id: string): Promise<void> {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase client not configured");
    const { error } = await sb.from("integrations").delete().eq("id", id);
    if (error) throw new Error(`integrations.delete failed: ${error.message}`);
  }
}
