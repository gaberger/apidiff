// Diff worker — accepts pre-resolved spec objects from the dereference
// worker pool and runs the two-pass diff:
//   pass 1: computeStructuralDiff (fast, exact-path) → posts partial-results
//   pass 2: enrichDiffWithRenames (slow, fuzzy) → posts done
//
// Parsing + $ref resolution moved to src/workers/dereference-worker.js so
// they can run in parallel for old + new specs.

import { computeStructuralDiff, enrichDiffWithRenames } from "../lib/domain/diff-algorithm.js";
import { flatten } from "../lib/domain/flatten.js";

function isAborted(signal) {
  return signal && signal.aborted;
}

self.addEventListener("message", (e) => {
  const { id, oldResolved, newResolved, signal } = e.data || {};
  try {
    self.postMessage({ id, type: "progress", stage: "flattening-old" });
    const fa = flatten(oldResolved);

    self.postMessage({ id, type: "progress", stage: "flattening-new" });
    const fb = flatten(newResolved);

    self.postMessage({ id, type: "progress", stage: "diffing-structural" });
    const structural = computeStructuralDiff(fa, fb);

    if (isAborted(signal)) {
      self.postMessage({ id, type: "cancelled" });
      return;
    }

    self.postMessage({ id, type: "partial-results", results: structural });

    self.postMessage({ id, type: "progress", stage: "diffing-fuzzy" });
    const enriched = enrichDiffWithRenames(structural, fa, fb, signal);

    if (isAborted(signal)) {
      self.postMessage({ id, type: "cancelled" });
      return;
    }

    // Compute summary counts in the worker so DiffSummary doesn't iterate 30k results 8
    // times on the main thread after await runDiff() returns.
    const summaryCounts = { removed: 0, added: 0, changed: 0, "type-change": 0, renamed: 0, moved: 0, unchanged: 0, breaking: 0 };
    const BREAKING_TYPES = new Set(["removed", "type-change", "renamed", "moved"]);
    for (const r of enriched) {
      if (r.type in summaryCounts) summaryCounts[r.type]++;
      if (BREAKING_TYPES.has(r.type)) summaryCounts.breaking++;
    }

    self.postMessage({ id, type: "done", results: enriched, summaryCounts });
  } catch (err) {
    self.postMessage({
      id,
      type: "error",
      message: err?.message ?? "diff worker failed",
    });
  }
});
