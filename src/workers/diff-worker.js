import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import $RefParser from "@apidevtools/json-schema-ref-parser";
import YAML from "yaml";
import { computeDiff } from "../lib/domain/diff-algorithm.js";

function countRefs(obj) {
  try { return (JSON.stringify(obj).match(/"\$ref"/g) || []).length; }
  catch { return 0; }
}

// Mirrors src/pages/DiffViewer.jsx's parseSpec: JSON-first when the input
// looks like JSON, YAML otherwise, with a YAML fallback for JSON-with-comments.
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

    // Prefer raw-text payloads — parsing here keeps the main thread free of
    // the multi-second JSON.parse + structuredClone-via-postMessage cost.
    // Object payloads still work for callers that already have parsed data
    // (e.g. cached resolved specs from the sidebar).
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

    self.postMessage({ id, type: "progress", stage: "diffing" });
    const results = computeDiff(oldResolved, newResolved);

    self.postMessage({
      id,
      type: "done",
      results,
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
