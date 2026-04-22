// Forward Networks release-notes adapter.
// Source: src/data/fwdnetworks.json — pre-scraped via
// scripts/analyze-release-notes.js (agent-browser over docs.fwd.app).
// Per hex boundary rules: adapters may only import from ports/ and the
// project's data assets. No cross-adapter imports.

import type { ReleaseNotesPort } from "../../core/ports/index.js";
import type {
  AggregateDiff,
  ReleaseNoteVersion,
  ReleaseNoteItem,
  ReleaseNotesBucket,
} from "../../core/domain/release-notes-types.js";

const BUCKETS: readonly ReleaseNotesBucket[] = [
  "breakingChanges",
  "scheduledBreakingChanges",
  "newOperations",
  "newModels",
  "modelChanges",
];

function emptyBuckets(): Pick<AggregateDiff, ReleaseNotesBucket> {
  const out: Partial<Record<ReleaseNotesBucket, { added: ReleaseNoteItem[]; removed: ReleaseNoteItem[] }>> = {};
  for (const b of BUCKETS) out[b] = { added: [], removed: [] };
  return out as Pick<AggregateDiff, ReleaseNotesBucket>;
}

export class ForwardNetworksReleaseNotesAdapter implements ReleaseNotesPort {
  readonly slug = "forward-networks";
  private readonly versions: readonly ReleaseNoteVersion[];

  /**
   * @param rawVersions the `.versions` array from fwdnetworks.json, already
   *        ordered newest-first. Each entry may carry a `.diff` with bucket
   *        arrays that match {@link ReleaseNoteItem}. Typed as unknown[] so
   *        callers can pass the JSON-imported shape without casting — this
   *        adapter does its own runtime narrowing.
   */
  constructor(rawVersions: readonly unknown[]) {
    this.versions = rawVersions.map((raw) => {
      const v = raw as { label: string; from?: string; breaking?: number; diff?: unknown };
      const normalizedDiff = v.diff ? this.normalizeDiff(v.diff, v.label) : undefined;
      return {
        label: v.label,
        releaseDate: v.from,
        year: v.from ? new Date(v.from).getFullYear() : undefined,
        breaking: v.breaking,
        diff: normalizedDiff,
      };
    });
  }

  private normalizeDiff(raw: unknown, label: string): AggregateDiff {
    const d = (raw ?? {}) as Record<string, unknown>;
    const out = emptyBuckets();
    for (const b of BUCKETS) {
      const bucket = d[b] as { added?: ReleaseNoteItem[]; removed?: ReleaseNoteItem[] } | undefined;
      if (bucket?.added) (out[b].added as ReleaseNoteItem[]).push(...bucket.added);
      if (bucket?.removed) (out[b].removed as ReleaseNoteItem[]).push(...bucket.removed);
    }
    return {
      from: typeof d.from === "string" ? d.from : "",
      to: typeof d.to === "string" ? d.to : label,
      ...out,
    };
  }

  async listVersions(): Promise<readonly ReleaseNoteVersion[]> {
    return this.versions;
  }

  async fetchRange(fromLabel: string, toLabel: string): Promise<AggregateDiff> {
    const fromIdx = this.versions.findIndex((v) => v.label === fromLabel);
    const toIdx = this.versions.findIndex((v) => v.label === toLabel);
    if (fromIdx < 0) throw new Error(`Unknown fromLabel '${fromLabel}' for forward-networks`);
    if (toIdx < 0) throw new Error(`Unknown toLabel '${toLabel}' for forward-networks`);

    // versions[] is newest-first. "from" is chronologically older →
    // higher index; "to" is newer → lower index. Aggregate every
    // versions[i].diff for i in [toIdx, fromIdx) — each such i represents
    // the step versions[i+1] → versions[i] which sits between older and newer.
    const idxNewer = Math.min(fromIdx, toIdx);
    const idxOlder = Math.max(fromIdx, toIdx);

    const agg = emptyBuckets();
    for (let i = idxNewer; i < idxOlder; i++) {
      const d = this.versions[i]?.diff;
      if (!d) continue;
      for (const b of BUCKETS) {
        (agg[b].added as ReleaseNoteItem[]).push(...d[b].added);
        (agg[b].removed as ReleaseNoteItem[]).push(...d[b].removed);
      }
    }
    const older = this.versions[idxOlder];
    const newer = this.versions[idxNewer];
    return {
      from: older?.label ?? fromLabel,
      to: newer?.label ?? toLabel,
      ...agg,
    };
  }
}
