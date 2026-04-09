const API_BASE = "/api";

export interface DiffResult {
  readonly type: "unchanged" | "removed" | "added" | "changed" | "renamed" | "moved" | "type-change";
  readonly path: string;
  readonly newPath?: string;
  readonly old?: unknown;
  readonly new?: unknown;
  readonly oldType?: string;
  readonly newType?: string;
}

export interface MigrationGuide {
  readonly title: string;
  readonly versions: { readonly base: string; readonly revision: string };
  readonly sunsetDate?: string;
  readonly timeline: Array<{ label: string; date?: string; description: string; status: "past" | "current" | "future" }>;
  readonly changes: Array<{
    readonly diffResult: DiffResult;
    readonly summary: string;
    readonly severity: "breaking" | "deprecated" | "non-breaking";
    readonly checklistItems: Array<{ id: string; text: string; completed: boolean }>;
  }>;
}

export interface Sample {
  name: string;
  description: string;
  v1: unknown;
  v2: unknown;
}

export async function fetchDiff(oldSpec: unknown, newSpec: unknown): Promise<DiffResult[]> {
  const res = await fetch(`${API_BASE}/diff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old: oldSpec, new: newSpec }),
  });
  if (!res.ok) throw new Error(`Diff failed: ${res.status}`);
  return res.json();
}

export async function fetchGuide(
  oldSpec: unknown,
  newSpec: unknown,
  baseVersion: string,
  revisionVersion: string,
  sunsetDate?: string,
): Promise<MigrationGuide> {
  const res = await fetch(`${API_BASE}/guide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old: oldSpec, new: newSpec, baseVersion, revisionVersion, sunsetDate }),
  });
  if (!res.ok) throw new Error(`Guide failed: ${res.status}`);
  return res.json();
}

export async function fetchSamples(): Promise<Sample[]> {
  const res = await fetch(`${API_BASE}/samples`);
  if (!res.ok) throw new Error(`Samples failed: ${res.status}`);
  return res.json();
}

export async function parseSpecFile(content: string, filename: string): Promise<{ document: unknown }> {
  const res = await fetch(`${API_BASE}/parse-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, filename }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Parse failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchSpecFromUrl(url: string): Promise<{ document: unknown }> {
  const res = await fetch(`${API_BASE}/fetch-spec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Fetch failed: ${res.status}`);
  }
  return res.json();
}
