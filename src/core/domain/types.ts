// Domain types — zero external imports

export type ChangeType =
  | "unchanged"
  | "removed"
  | "added"
  | "changed"
  | "renamed"
  | "moved"
  | "type-change";

export type Severity = "critical" | "high" | "medium" | "low" | "none";

export type GuideSeverity = "breaking" | "deprecated" | "non-breaking";

export interface DiffResult {
  readonly type: ChangeType;
  readonly path: string;
  readonly newPath?: string;
  readonly old?: unknown;
  readonly new?: unknown;
  readonly oldType?: string;
  readonly newType?: string;
  readonly confidence?: number; // 0-1, present for renames/moves
}

export interface FlatMap {
  readonly [key: string]: unknown;
}

export interface MigrationChange {
  readonly diffResult: DiffResult;
  readonly summary: string;
  readonly severity: GuideSeverity;
  readonly codeExamples: CodeExampleSet;
  readonly checklistItems: ChecklistItem[];
}

export interface CodeExampleSet {
  readonly [language: string]: {
    readonly before: string;
    readonly after: string;
  };
}

export interface ChecklistItem {
  readonly id: string;
  readonly text: string;
  readonly subtext?: string;
  completed: boolean;
}

export interface TimelineStep {
  readonly label: string;
  readonly date?: string;
  readonly description: string;
  readonly status: "past" | "current" | "future";
}

export interface MigrationGuide {
  readonly title: string;
  readonly versions: { readonly base: string; readonly revision: string };
  readonly sunsetDate?: string;
  readonly timeline: TimelineStep[];
  readonly changes: MigrationChange[];
}

export interface SchemaCompareResult {
  readonly output: string;
  readonly exitCode: number;
  readonly mode: SchemaCompareMode;
  readonly breakingCount: number;
  readonly deprecatedCount: number;
  readonly nonBreakingCount: number;
}

export type SchemaCompareMode = "changelog" | "breaking" | "summary";

export const SEVERITY_MAP: Record<ChangeType, Severity> = {
  removed: "critical",
  "type-change": "high",
  renamed: "high",
  moved: "medium",
  changed: "medium",
  added: "low",
  unchanged: "none",
} as const;

export const GUIDE_SEVERITY_MAP: Record<ChangeType, GuideSeverity> = {
  removed: "breaking",
  "type-change": "breaking",
  renamed: "breaking",
  moved: "breaking",
  changed: "deprecated",
  added: "non-breaking",
  unchanged: "non-breaking",
} as const;

export type OpenApiFormat = "openapi-2.0" | "openapi-3.0" | "openapi-3.1";

export interface ResolvedSpec {
  readonly format: OpenApiFormat;
  readonly document: unknown;
  readonly metadata: {
    readonly title: string;
    readonly version: string;
  };
}

export interface IntegrationVersion {
  readonly label: string;
  readonly url: string;
}

export interface IntegrationComparison {
  readonly label: string;
  readonly v1_url: string;
  readonly v2_url: string;
}

export interface Integration {
  readonly id: string;
  readonly name: string;
  readonly slug?: string;
  readonly category?: string;
  readonly color?: string;
  readonly logo_url?: string;
  readonly base_url?: string;
  readonly changelog_url?: string;
  readonly versions?: ReadonlyArray<IntegrationVersion>;
  readonly comparisons?: ReadonlyArray<IntegrationComparison>;
}

export type IntegrationDraft = Omit<Integration, "id">;

export interface ProxyFetchResult {
  readonly document: unknown;
  readonly contentType?: string;
  readonly status: number;
}
