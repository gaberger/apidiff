// Domain constants — ported from TypeScript types.ts

export const SEVERITY_MAP = {
  removed: "critical",
  "type-change": "high",
  renamed: "high",
  moved: "medium",
  changed: "medium",
  added: "low",
  unchanged: "none",
};

export const GUIDE_SEVERITY_MAP = {
  removed: "breaking",
  "type-change": "breaking",
  renamed: "breaking",
  moved: "breaking",
  changed: "deprecated",
  added: "non-breaking",
  unchanged: "non-breaking",
};