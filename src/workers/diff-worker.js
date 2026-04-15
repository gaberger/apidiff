import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import $RefParser from "@apidevtools/json-schema-ref-parser";
import YAML from "yaml";
import { computeStructuralDiff, enrichDiffWithRenames } from "../lib/domain/diff-algorithm.js";
import { flatten } from "../lib/domain/flatten.js";

function countRefs(obj) {
  try { return (JSON.stringify(obj).match(/"\$ref"/g) || []).length; }
  catch { return 0; }
}

function parseSpec(text, sideLabel) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`${sideLabel} spec is empty`);
  const looksJson = trimmed[0] === "{" || trimmed[0] === "[";
  if (looksJson) {
    try { return JSON.parse(trimmed); }
    catch (jsonErr) {
      try { return YAML.parse(trimmed); }
      catch { throw new Error(`${sideLabel}: not valid JSON — ${jsonErr.message}`); }
    }
  }
  try { return YAML.parse(trimmed); }
  catch (yamlErr) {
    throw new Error(`${sideLabel}: not valid JSON or YAML — ${yamlErr.message}`);
  }
}

self.addEventListener("message", async (e) => {
  const { id, oldText, newText, oldSpec: oldObj, newSpec: newObj } = e.data || {};
  try {
    self.postMessage({ id, type: "progress", stage: "parsing" });

    const oldSpec = oldText !== undefined ? parseSpec(oldText, "Original spec") : oldObj;
    const newSpec = newText !== undefined ? parseSpec(newText, "Updated spec") : newObj;

    self.postMessage({ id, type: "progress", stage: "dereferencing" });

    const oldHadRefs = countRefs(oldSpec);
    const newHadRefs = countRefs(newSpec);

    let oldResolved = oldSpec;
    let newResolved = newSpec;

    if (oldHadRefs > 0) {
      oldResolved = await $RefParser.dereference(structuredClone(oldSpec));
    }
    self.postMessage({ id, type: "progress", stage: "dereferencing", half: true });
    if (newHadRefs > 0) {
      newResolved = await $RefParser.dereference(structuredClone(newSpec));
    }

    // Two-pass diff. Pass 1 (structural — exact path membership only) is
    // O(n) and runs in well under a second even on multi-MB resolved specs.
    // We post it as 'partial-results' so the UI can paint added/removed/
    // changed badges immediately. Pass 2 (rename + move detection) is the
    // expensive Levenshtein-based pass; consumers see it land moments later
    // as enriched DiffResult entries replacing the matched added/removed
    // pairs in place.
    self.postMessage({ id, type: "progress", stage: "diffing-structural" });
    const fa = flatten(oldResolved);
    const fb = flatten(newResolved);
    const structural = computeStructuralDiff(fa, fb);

    self.postMessage({ id, type: "partial-results", results: structural });

    self.postMessage({ id, type: "progress", stage: "diffing-fuzzy" });
    const enriched = enrichDiffWithRenames(structural, fa, fb);

    self.postMessage({
      id,
      type: "done",
      results: enriched,
      oldResolved,
      newResolved,
      refsResolved: (oldHadRefs + newHadRefs) > 0
        ? { old: oldHadRefs, new: newHadRefs }
        : null,
    });
  } catch (err) {
    self.postMessage({
      id,
      type: "error",
      message: err?.message ?? "diff worker failed",
    });
  }
});
