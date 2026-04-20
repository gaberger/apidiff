// Transform Forward Networks release-notes diffs into API Changeset v0.2
// documents. Pure, no side effects. Mapping rules:
//
//   Source bucket              -> op         target    severity    breaking
//   -----------------------    -- ---------  --------  ----------  --------
//   newOperations.added        -> add        endpoint  info        false
//   newOperations.removed      -> remove     endpoint  breaking    true
//   newModels.added            -> add        schema    info        false
//   newModels.removed          -> remove     schema    breaking    true
//   modelChanges.added         -> constrain  schema    notice      false
//   breakingChanges.added      -> constrain  schema    breaking    true
//   scheduledBreakingChanges.added -> deprecate endpoint notice     false
//
// Release notes don't carry JSON Pointers, so the emitted changes use an
// opaque `#/changelog/<bucket>/<ticket>` pointer. Authors who want a real
// spec-resolvable pointer should rewrite after matching the ticket to an
// OpenAPI path manually.

const AREA_PAT = /^([^:]+?)\s*:/;
const ID_SAFE = /^[A-Z0-9][A-Z0-9_-]*$/;

function sanitizeId(title, bucket, seq) {
  if (title && ID_SAFE.test(title)) return title;
  if (title) return `CHG-${title.replace(/[^A-Z0-9_-]/gi, "-").toUpperCase()}`;
  return `CHG-${bucket.toUpperCase()}-${seq}`;
}

function extractArea(description) {
  if (!description) return undefined;
  const m = description.match(AREA_PAT);
  if (!m) return undefined;
  const area = m[1].trim();
  // Reject overly long "areas" — some items start with a full sentence.
  if (area.length > 40) return undefined;
  return area;
}

function pointerFor(bucket, title) {
  const suffix = title || "item";
  return `#/changelog/${bucket}/${suffix}`;
}

function buildChange({ item, op, target, severity, breaking, bucket, seq, toRelease }) {
  const area = extractArea(item.description);
  const pointer = pointerFor(bucket, item.title);

  const tags = [bucket];
  if (area) tags.push(area.toLowerCase().replace(/\s+/g, "-"));
  if (item.title) tags.push(item.title);

  const change = {
    id: sanitizeId(item.title, bucket, seq),
    op,
    target,
    severity,
    breaking,
    description: item.description,
    tags,
  };

  if (op === "add")       change.to = pointer;
  if (op === "remove")    change.from = pointer;
  if (op === "constrain") change.at = pointer;
  if (op === "deprecate") {
    change.at = pointer;
    change.lifecycle = { reason: `Scheduled for removal per ${toRelease} release notes.` };
  }

  if (breaking) {
    change.migration = {
      client_action: "Refer to the source release note and the affected endpoint or schema for the required update.",
    };
  }

  return change;
}

/**
 * Build one Changeset document from a single {from, to, breakingChanges, ...}
 * diff entry and the matching version metadata.
 *
 * @param {object} data  The full release-notes-diff.json (for date lookup).
 * @param {object} diff  A single diff entry.
 * @param {{ apiName?: string }} [opts]
 * @returns {object}     A Changeset document that validates against v0.2.
 */
export function releaseNotesToChangeset(data, diff, opts = {}) {
  const apiName = opts.apiName || "Forward Networks API";
  const versionDate = new Map((data.versions || []).map((v) => [v.version, v.releaseDate]));
  const changes = [];
  let seq = 1;

  const push = (cfg) => changes.push(buildChange({ ...cfg, seq: seq++, toRelease: diff.to }));

  for (const item of diff.newOperations?.added || []) {
    push({ item, op: "add", target: "endpoint", severity: "info", breaking: false, bucket: "new-operation" });
  }
  for (const item of diff.newOperations?.removed || []) {
    push({ item, op: "remove", target: "endpoint", severity: "breaking", breaking: true, bucket: "removed-operation" });
  }
  for (const item of diff.newModels?.added || []) {
    push({ item, op: "add", target: "schema", severity: "info", breaking: false, bucket: "new-model" });
  }
  for (const item of diff.newModels?.removed || []) {
    push({ item, op: "remove", target: "schema", severity: "breaking", breaking: true, bucket: "removed-model" });
  }
  for (const item of diff.modelChanges?.added || []) {
    push({ item, op: "constrain", target: "schema", severity: "notice", breaking: false, bucket: "model-change" });
  }
  for (const item of diff.breakingChanges?.added || []) {
    push({ item, op: "constrain", target: "schema", severity: "breaking", breaking: true, bucket: "breaking-change" });
  }
  for (const item of diff.scheduledBreakingChanges?.added || []) {
    push({ item, op: "deprecate", target: "endpoint", severity: "notice", breaking: false, bucket: "scheduled-deprecation" });
  }

  return {
    changeset_version: "0.2",
    api: {
      name: apiName,
      from: { version: diff.from },
      to: { version: diff.to },
    },
    released: versionDate.get(diff.to),
    summary: `Generated from ${apiName} release notes for ${diff.to}.`,
    changes,
  };
}
