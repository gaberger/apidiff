// Release-notes service — orchestrates per-provider release-notes access.
// Parallel to DiscoveryService. May import from domain/ and ports/ only.

import type { AggregateDiff, ReleaseNoteVersion } from "../domain/release-notes-types.js";
import type { ReleaseNotesPort } from "../ports/index.js";

export class ReleaseNotesService {
  private readonly adapters: Map<string, ReleaseNotesPort>;

  constructor(adapters: ReleaseNotesPort[]) {
    this.adapters = new Map(adapters.map((a) => [a.slug, a]));
  }

  /** True when we have a registered release-notes adapter for this provider. */
  has(slug: string): boolean {
    return this.adapters.has(slug);
  }

  /** Returns the adapter's version timeline, or null if no adapter is registered. */
  async listVersions(slug: string): Promise<readonly ReleaseNoteVersion[] | null> {
    const adapter = this.adapters.get(slug);
    if (!adapter) return null;
    return adapter.listVersions();
  }

  /**
   * Returns the aggregated diff covering every single-step release-note
   * entry between fromLabel (older) and toLabel (newer), inclusive of
   * every intermediate step. Throws if no adapter is registered for the
   * slug — callers should check has() first.
   */
  async fetchRange(slug: string, fromLabel: string, toLabel: string): Promise<AggregateDiff> {
    const adapter = this.adapters.get(slug);
    if (!adapter) throw new Error(`No release-notes adapter registered for provider '${slug}'`);
    return adapter.fetchRange(fromLabel, toLabel);
  }
}
