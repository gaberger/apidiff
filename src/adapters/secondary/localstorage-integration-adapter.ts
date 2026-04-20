// localStorage-backed implementation of IntegrationStoragePort.
// Per ADR-020 the integration store lives in the browser. Namespaced key
// allows schema evolution via a new suffix.

import type { Integration, IntegrationDraft } from "../../core/domain/types.js";
import type { IntegrationStoragePort } from "../../core/ports/index.js";

const STORAGE_KEY = "apidiff.integrations.v1";

function readAll(): Integration[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Integration[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: Integration[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function makeId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `local-${Date.now().toString(36)}-${rand}`;
}

export class LocalStorageIntegrationAdapter implements IntegrationStoragePort {
  async list(): Promise<Integration[]> {
    return readAll();
  }

  async create(draft: IntegrationDraft): Promise<Integration> {
    const all = readAll();
    const created: Integration = { ...draft, id: makeId() };
    writeAll([...all, created]);
    return created;
  }

  async update(id: string, patch: Partial<Integration>): Promise<Integration> {
    const all = readAll();
    const idx = all.findIndex((i) => i.id === id);
    if (idx < 0) throw new Error(`Integration not found: ${id}`);
    const existing = all[idx]!;
    // Partial<Integration>['name'] widens to string | undefined; guarantee
    // the required fields of Integration by falling back to `existing`.
    const updated: Integration = {
      ...existing,
      ...patch,
      id,
      name: patch.name ?? existing.name,
    };
    const next = [...all];
    next[idx] = updated;
    writeAll(next);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const all = readAll();
    writeAll(all.filter((i) => i.id !== id));
  }
}
