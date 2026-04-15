// Dereference worker — parses one OpenAPI spec (JSON or YAML) and resolves
// all $refs. Runs as one of two parallel instances managed by useDiffWorker
// so the old + new specs can dereference simultaneously, halving wall-clock
// for the deref-bound step on large pairs.
//
// Owns its own $RefParser + yaml deps; the diff-worker no longer carries them.

import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import $RefParser from "@apidevtools/json-schema-ref-parser";
import YAML from "yaml";

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
  const { id, text, spec, sideLabel } = e.data || {};
  try {
    self.postMessage({ id, type: "progress", stage: "parsing" });
    const parsed = text !== undefined ? parseSpec(text, sideLabel || "spec") : spec;

    self.postMessage({ id, type: "progress", stage: "dereferencing" });
    // Count refs on the raw text string when available — avoids a full JSON.stringify
    // of the parsed object just to count occurrences (B2 fix).
    const refCount = text !== undefined
      ? (text.match(/"\$ref"\s*:/g) || []).length
      : (() => { try { return (JSON.stringify(parsed).match(/"\$ref"/g) || []).length; } catch { return 0; } })();
    // $RefParser.dereference does not mutate an exclusively-owned input; the
    // worker owns `parsed` so structuredClone is unnecessary here (B3 fix).
    const resolved = refCount > 0
      ? await $RefParser.dereference(parsed)
      : parsed;

    // Stringify in the worker so the main thread never touches large spec objects.
    self.postMessage({ id, type: "progress", stage: "stringifying" });
    const stringified = JSON.stringify(resolved, null, 2);

    // Only send the stringified form — resolved object is NOT sent back.
    // This eliminates the structured-clone cost of copying a large object graph
    // across the worker→main boundary (B1a fix).
    self.postMessage({ id, type: "done", stringified, refCount });
  } catch (err) {
    self.postMessage({
      id,
      type: "error",
      message: err?.message ?? "dereference failed",
    });
  }
});
