// Transform Forward Networks release-notes diffs into API Changeset v0.2
// documents. Pure, no side effects.
//
// Mapping rules:
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
// When the scraped release note carries one or more affectedOps
// ({ method, path, query }), this emits real JSON Pointers of the form
//   #/paths/~1api~1collector-tasks/post
// (RFC 6901 escaping: "/" -> "~1", "~" -> "~0"). Items with no affectedOps
// fall back to an opaque #/changelog/<bucket>/<ticket> pointer because
// release notes don't carry enough shape to resolve a spec path.

const ID_SAFE = /^[A-Z0-9][A-Z0-9_-]*$/;
const SUNSET_RE = /removed in release (\d+\.\d+(?:\.\d+)?)/i;

function sanitizeId(title, bucket, seq) {
  if (title && ID_SAFE.test(title)) return title;
  if (title) return `CHG-${title.replace(/[^A-Z0-9_-]/gi, "-").toUpperCase()}`;
  return `CHG-${bucket.toUpperCase()}-${seq}`;
}

function escPointer(segment) {
  // RFC 6901: ~ -> ~0, / -> ~1
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function opPointer({ method, path }) {
  return `#/paths/${escPointer(path)}/${method.toLowerCase()}`;
}

function humanReadable({ method, path, query }) {
  const q = query ? `?${query}` : "";
  return `${method} ${path}${q}`;
}

function fallbackPointer(bucket, title) {
  return `#/changelog/${bucket}/${title || "item"}`;
}

function pointersFor(affectedOps, bucket, title) {
  if (!affectedOps || affectedOps.length === 0) return fallbackPointer(bucket, title);
  if (affectedOps.length === 1) return opPointer(affectedOps[0]);
  return affectedOps.map(opPointer);
}

function affectedOperationsList(affectedOps) {
  if (!affectedOps || affectedOps.length === 0) return undefined;
  return affectedOps.map(opPointer);
}

function humanReadableList(affectedOps) {
  if (!affectedOps || affectedOps.length === 0) return undefined;
  return affectedOps.map(humanReadable);
}

// Shorten "26.3.0" -> "26.3" to match docs.fwd.app section URLs.
function shortVersion(v) {
  if (!v) return v;
  const m = String(v).match(/^(\d+\.\d+)(?:\.\d+)?$/);
  return m ? m[1] : v;
}

// "Network Collection" -> "network-collection".
// Preserves the slug exactly as docs.fwd.app exposes it for section specs.
function sectionSlug(area) {
  if (!area) return undefined;
  return area
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || undefined;
}

function sourceUrls(toRelease, area, ticket) {
  const slug = sectionSlug(area);
  const ver = shortVersion(toRelease);
  if (!slug || !ver) return undefined;
  const base = `https://docs.fwd.app/${ver}/api`;
  return {
    specUrl: `${base}/spec/${slug}.json`,
    ...(ticket ? { docsUrl: `${base}/${slug}/${ticket}` } : {}),
  };
}

function extractSunsetVersion(description) {
  const m = description?.match(SUNSET_RE);
  return m ? m[1] : undefined;
}

function buildChange({ item, op, target, severity, breaking, bucket, seq, toRelease }) {
  const pointers = pointersFor(item.affectedOps, bucket, item.title);
  const affectedPointers = affectedOperationsList(item.affectedOps);
  const humanOps = humanReadableList(item.affectedOps);
  const tags = [bucket];
  if (item.area) tags.push(item.area.toLowerCase().replace(/\s+/g, "-"));
  if (item.title) tags.push(item.title);

  const change = {
    id: sanitizeId(item.title, bucket, seq),
    op,
    target,
    severity,
    breaking,
    description: item.description
      ? `${item.area ? item.area + ": " : ""}${item.description}`
      : (item.area || ""),
    tags,
  };

  if (op === "add")       change.to = pointers;
  if (op === "remove")    change.from = pointers;
  if (op === "constrain") change.at = Array.isArray(pointers) ? pointers[0] : pointers;
  if (op === "deprecate") {
    change.at = Array.isArray(pointers) ? pointers[0] : pointers;
    change.lifecycle = {
      reason: `Scheduled for removal per ${toRelease} release notes.`,
    };
    const sunsetVer = extractSunsetVersion(item.description);
    if (sunsetVer) change.lifecycle.reason = `Scheduled for removal in release ${sunsetVer}.`;
  }

  // Attach affectedOperations + humanReadable whenever the item cites
  // concrete HTTP verb+path entries. These give human readers the blast
  // radius + operation labels without resolving JSON Pointers.
  if (affectedPointers) change.affectedOperations = affectedPointers;
  if (humanOps) change.humanReadable = humanOps;

  // Jump-to-spec shortcuts derived from the area/ticket/release. Lets
  // a reader open the per-section OpenAPI file or the ticket's docs page
  // without leaving the changeset.
  const source = sourceUrls(toRelease, item.area, item.title);
  if (source) change.source = source;

  if (breaking) {
    change.migration = {
      client_action: "Refer to the source release note and the affected endpoint or schema for the required update.",
    };
  }

  return change;
}

/**
 * Build one Changeset document from a single {from, to, ...} diff entry and
 * the matching version metadata.
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
  const push = (cfg) =>
    changes.push(buildChange({ ...cfg, seq: seq++, toRelease: diff.to }));

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
