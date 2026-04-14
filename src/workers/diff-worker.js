import $RefParser from "@apidevtools/json-schema-ref-parser";
import { computeDiff } from "@/lib/domain/diff-algorithm.js";

function countRefs(obj) {
  try { return (JSON.stringify(obj).match(/"\$ref"/g) || []).length; }
  catch { return 0; }
}

self.addEventListener("message", async (e) => {
  const { id, oldSpec, newSpec } = e.data || {};
  try {
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
