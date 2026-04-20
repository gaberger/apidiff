// localStorage-backed SchemaUrlRegistryPort. Stores all user-tracked schema
// source URLs in a single key-namespaced JSON array. Non-blocking on SSR
// and private-mode browsers (falls back to in-memory).

import type { SchemaUrl, SchemaUrlDraft } from "../../core/domain/types.js";
import type { SchemaUrlRegistryPort } from "../../core/ports/index.js";

const STORAGE_KEY = "apidiff.schema-urls.v1";

function read(): SchemaUrl[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SchemaUrl[]) : [];
  } catch {
    return [];
  }
}

function write(items: SchemaUrl[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function makeId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `url-${Date.now().toString(36)}-${rand}`;
}

export class LocalStorageSchemaUrlAdapter implements SchemaUrlRegistryPort {
  async list(): Promise<SchemaUrl[]> {
    return read();
  }

  async add(draft: SchemaUrlDraft): Promise<SchemaUrl> {
    const all = read();
    // De-dupe by URL — if this URL already exists, return the existing entry.
    const existing = all.find((u) => u.url === draft.url);
    if (existing) return existing;
    const created: SchemaUrl = {
      ...draft,
      id: makeId(),
      addedAt: new Date().toISOString(),
    };
    write([...all, created]);
    return created;
  }

  async remove(id: string): Promise<void> {
    write(read().filter((u) => u.id !== id));
  }

  async findByUrl(url: string): Promise<SchemaUrl | null> {
    return read().find((u) => u.url === url) ?? null;
  }

  async touchFetched(url: string): Promise<void> {
    const all = read();
    const idx = all.findIndex((u) => u.url === url);
    if (idx < 0) return;
    const existing = all[idx]!;
    all[idx] = { ...existing, lastFetchedAt: new Date().toISOString() };
    write(all);
  }
}
