import { useRef, useCallback, useEffect } from "react";

// Three-worker pool:
//   - derefOldRef: parses + dereferences the OLD spec
//   - derefNewRef: parses + dereferences the NEW spec (in parallel with old)
//   - diffRef:     receives both resolved specs, runs two-pass diff
//
// Parallel dereference roughly halves wall-clock on the deref-bound step
// for large spec pairs. Each worker owns its own $RefParser bundle; in
// production Vite pre-bundles once and reuses across worker spawns.

function spawnDerefWorker() {
  return new Worker(
    new URL("../workers/dereference-worker.js", import.meta.url),
    { type: "module" },
  );
}

function spawnDiffWorker() {
  return new Worker(
    new URL("../workers/diff-worker.js", import.meta.url),
    { type: "module" },
  );
}

// Drive a worker round-trip. Returns a promise that resolves with the
// payload of the first 'done' message and rejects on 'error'. Forwards
// 'progress' and 'partial-results' to the supplied callbacks. Uses a
// distinct local id so messages from different in-flight requests on
// the same worker don't get confused.
function runOnce(worker, payload, { onProgress, onPartial } = {}) {
  return new Promise((resolve, reject) => {
    const onMessage = (e) => {
      const data = e.data || {};
      if (data.type === "progress") { onProgress?.(data); return; }
      if (data.type === "partial-results") { onPartial?.(data.results); return; }
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onMessageError);
      if (data.type === "done") resolve(data);
      else if (data.type === "error") reject(new Error(data.message));
      else if (data.type === "cancelled") reject(new DOMException("cancelled", "AbortError"));
      else reject(new Error(`unexpected message type: ${data.type}`));
    };
    const onError = (ev) => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onMessageError);
      reject(new Error(ev?.message || ev?.error?.message || "Worker failed to load or crashed"));
    };
    const onMessageError = (ev) => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onMessageError);
      reject(new Error("Worker message deserialization failed: " + (ev?.data ?? "")));
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onMessageError);
    worker.postMessage(payload);
  });
}

export function useDiffWorker() {
  const derefOldRef = useRef(null);
  const derefNewRef = useRef(null);
  const diffRef = useRef(null);
  const seqRef = useRef(0);
  const cancelledIdsRef = useRef(new Set());

  const ensureWorkers = useCallback(() => {
    if (!derefOldRef.current) derefOldRef.current = spawnDerefWorker();
    if (!derefNewRef.current) derefNewRef.current = spawnDerefWorker();
    if (!diffRef.current) diffRef.current = spawnDiffWorker();
    return { derefOld: derefOldRef.current, derefNew: derefNewRef.current, diff: diffRef.current };
  }, []);

  const cancel = useCallback(() => {
    // Mark every in-flight id cancelled so any in-progress runDiff aborts
    // before continuing to the next stage. Then terminate all workers and
    // null the refs so the next runDiff spawns a fresh pool.
    for (let i = 1; i <= seqRef.current; i++) cancelledIdsRef.current.add(i);
    if (derefOldRef.current) { derefOldRef.current.terminate(); derefOldRef.current = null; }
    if (derefNewRef.current) { derefNewRef.current.terminate(); derefNewRef.current = null; }
    if (diffRef.current) { diffRef.current.terminate(); diffRef.current = null; }
  }, []);

  const runDiff = useCallback(async (oldSpecOrText, newSpecOrText, { onProgress, onPartial, signal } = {}) => {
    const { derefOld, derefNew, diff } = ensureWorkers();
    const id = ++seqRef.current;

    const oldPayload = typeof oldSpecOrText === "string"
      ? { id, text: oldSpecOrText, sideLabel: "Original spec" }
      : { id, spec: oldSpecOrText, sideLabel: "Original spec" };
    const newPayload = typeof newSpecOrText === "string"
      ? { id, text: newSpecOrText, sideLabel: "Updated spec" }
      : { id, spec: newSpecOrText, sideLabel: "Updated spec" };

    // Forward dereference progress; combine the two into a single
    // "dereferencing" stage for the consumer. We don't know which side
    // finishes first, so we coalesce: emit "parsing" once, "dereferencing"
    // once, and let the worker post its own granular events.
    let parsingEmitted = false;
    let derefEmitted = false;
    const forward = (evt) => {
      if (cancelledIdsRef.current.has(id)) return;
      if (evt.stage === "parsing" && !parsingEmitted) {
        parsingEmitted = true;
        onProgress?.({ stage: "parsing" });
      }
      if (evt.stage === "dereferencing" && !derefEmitted) {
        derefEmitted = true;
        onProgress?.({ stage: "dereferencing" });
      }
    };

    const [{ resolved: oldResolved, stringified: oldStringified, refCount: oldRefs },
           { resolved: newResolved, stringified: newStringified, refCount: newRefs }] =
      await Promise.all([
        runOnce(derefOld, oldPayload, { onProgress: forward }),
        runOnce(derefNew, newPayload, { onProgress: forward }),
      ]);

    if (cancelledIdsRef.current.has(id)) {
      cancelledIdsRef.current.delete(id);
      throw new Error("cancelled");
    }

    const diffResult = await runOnce(diff, { id, oldResolved, newResolved, signal }, { onProgress, onPartial });

    if (cancelledIdsRef.current.has(id)) {
      cancelledIdsRef.current.delete(id);
      throw new Error("cancelled");
    }

    return {
      results: diffResult.results,
      summaryCounts: diffResult.summaryCounts,
      oldResolved,
      newResolved,
      oldStringified,
      newStringified,
      refsResolved: (oldRefs + newRefs) > 0 ? { old: oldRefs, new: newRefs } : null,
    };
  }, [ensureWorkers]);

  useEffect(() => () => {
    if (derefOldRef.current) { derefOldRef.current.terminate(); derefOldRef.current = null; }
    if (derefNewRef.current) { derefNewRef.current.terminate(); derefNewRef.current = null; }
    if (diffRef.current) { diffRef.current.terminate(); diffRef.current = null; }
    cancelledIdsRef.current.clear();
  }, []);

  return { runDiff, cancel };
}
