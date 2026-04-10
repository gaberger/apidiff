// src/core/domain/types.ts
var SEVERITY_MAP = {
  removed: "critical",
  "type-change": "high",
  renamed: "high",
  moved: "medium",
  changed: "medium",
  added: "low",
  unchanged: "none"
};
var GUIDE_SEVERITY_MAP = {
  removed: "breaking",
  "type-change": "breaking",
  renamed: "breaking",
  moved: "breaking",
  changed: "deprecated",
  added: "non-breaking",
  unchanged: "non-breaking"
};
export {
  SEVERITY_MAP,
  GUIDE_SEVERITY_MAP
};
