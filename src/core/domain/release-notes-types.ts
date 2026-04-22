// Domain types for per-integration release-notes parsing — zero external imports.
// Parallel to discovery-types.ts; models the release-notes side of a provider
// (what changed between version A and version B) independently from the
// OpenAPI-spec side (which is modelled by discovery-types + types).

/** A single release-note bucket entry scraped from a provider's release notes. */
export interface ReleaseNoteItem {
  readonly title: string;
  readonly description: string;
  readonly affectedOps?: readonly string[];
}

/** One version-to-version delta in the provider's release-notes timeline. */
export interface ReleaseNoteVersion {
  readonly label: string;
  readonly releaseDate?: string;
  readonly year?: number;
  /** Single-step diff: changes INTO this version from the immediately-prior one. */
  readonly diff?: AggregateDiff;
  /** Count of breaking changes for quick timeline badges. */
  readonly breaking?: number;
}

/** The shape every ReleaseNotesPort.fetchRange() implementation must return. */
export interface AggregateDiff {
  readonly from: string;
  readonly to: string;
  readonly breakingChanges: { readonly added: ReleaseNoteItem[]; readonly removed: ReleaseNoteItem[] };
  readonly scheduledBreakingChanges: { readonly added: ReleaseNoteItem[]; readonly removed: ReleaseNoteItem[] };
  readonly newOperations: { readonly added: ReleaseNoteItem[]; readonly removed: ReleaseNoteItem[] };
  readonly newModels: { readonly added: ReleaseNoteItem[]; readonly removed: ReleaseNoteItem[] };
  readonly modelChanges: { readonly added: ReleaseNoteItem[]; readonly removed: ReleaseNoteItem[] };
}

export type ReleaseNotesBucket = keyof Omit<AggregateDiff, "from" | "to">;
