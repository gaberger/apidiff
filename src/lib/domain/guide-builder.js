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

// src/core/domain/guide-builder.ts
function buildGuide(diffs, baseVersion, revisionVersion, sunsetDate) {
  const changes = diffs.filter((d) => d.type !== "unchanged").map((d) => toMigrationChange(d));
  return {
    title: `Migration guide: ${baseVersion} → ${revisionVersion}`,
    versions: { base: baseVersion, revision: revisionVersion },
    sunsetDate,
    timeline: buildTimeline(sunsetDate),
    changes
  };
}
function toMigrationChange(diff) {
  return {
    diffResult: diff,
    summary: generateSummary(diff),
    severity: classifySeverity(diff),
    codeExamples: generateCodeExamples(diff),
    checklistItems: generateChecklist(diff)
  };
}
function generateSummary(diff) {
  switch (diff.type) {
    case "removed":
      return `Field \`${diff.path}\` has been removed`;
    case "added":
      return `New field \`${diff.path}\` is now available`;
    case "renamed":
      return `Field \`${diff.path}\` has been renamed to \`${diff.newPath}\``;
    case "moved":
      return `Field \`${diff.path}\` has been moved to \`${diff.newPath}\``;
    case "type-change":
      return `Field \`${diff.path}\` changed type from ${diff.oldType} to ${diff.newType}`;
    case "changed":
      return `Field \`${diff.path}\` value changed from \`${JSON.stringify(diff.old)}\` to \`${JSON.stringify(diff.new)}\``;
    default:
      return `Field \`${diff.path}\` is unchanged`;
  }
}
function classifySeverity(diff) {
  return GUIDE_SEVERITY_MAP[diff.type];
}
function generateCodeExamples(diff) {
  const oldPath = diff.path.split(".").map((p) => `["${p}"]`).join("");
  const newPath = (diff.newPath ?? diff.path).split(".").map((p) => `["${p}"]`).join("");
  const examples = {};
  if (diff.type === "removed") {
    examples.node = {
      before: `const value = response${oldPath};`,
      after: `// Field removed — delete this access`
    };
    examples.python = {
      before: `value = response${oldPath.replace(/\["/g, '["').replace(/"\]/g, '"]')}`,
      after: `# Field removed — delete this access`
    };
  } else if (diff.type === "renamed" || diff.type === "moved") {
    examples.node = {
      before: `const value = response${oldPath};`,
      after: `const value = response${newPath};`
    };
    examples.python = {
      before: `value = response${oldPath}`,
      after: `value = response${newPath}`
    };
  } else if (diff.type === "type-change") {
    examples.node = {
      before: `const value: ${diff.oldType} = response${oldPath};`,
      after: `const value: ${diff.newType} = response${newPath}; // type changed`
    };
  }
  return examples;
}
function generateChecklist(diff) {
  const id = `chk-${diff.type}-${diff.path.replace(/\./g, "-")}`;
  switch (diff.type) {
    case "removed":
      return [{ id, text: `Remove all reads of \`${diff.path}\``, completed: false }];
    case "renamed":
      return [{ id, text: `Replace \`${diff.path}\` with \`${diff.newPath}\``, completed: false }];
    case "moved":
      return [{ id, text: `Update access path from \`${diff.path}\` to \`${diff.newPath}\``, completed: false }];
    case "type-change":
      return [
        { id, text: `Update serialisation for \`${diff.path}\` (${diff.oldType} → ${diff.newType})`, completed: false }
      ];
    case "changed":
      return [{ id, text: `Verify new default for \`${diff.path}\` is acceptable`, completed: false }];
    case "added":
      return [{ id, text: `Optionally adopt new field \`${diff.path}\``, completed: false }];
    default:
      return [];
  }
}
function buildTimeline(sunsetDate) {
  const steps = [
    { label: "Deprecated", description: "Old version marked deprecated", status: "past" },
    { label: "Migration window", description: "Both versions available", status: "current" }
  ];
  if (sunsetDate) {
    steps.push({ label: "Sunset", date: sunsetDate, description: "Old version removed", status: "future" });
  }
  return steps;
}
export {
  buildGuide
};
