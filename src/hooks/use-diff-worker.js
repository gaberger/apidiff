import { useRef, useCallback, useEffect } from "react";

export function useDiffWorker() {
  const workerRef = useRef(null);
  const seqRef = useRef(0);
  const pendingRef = useRef(new Map());

  const ensureWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("../workers/diff-worker.js", import.meta.url),
        { type: "module" },
      );
      workerRef.current.addEventListener("message", (e) => {
        const { id, type } = e.data || {};
        const p = pendingRef.current.get(id);
        if (!p) return;
        if (type === "progress") {
          p.onProgress?.(e.data);
        } else if (type === "partial-results") {
          // Two-pass diff: structural (added/removed/changed) lands here
          // first, then full enriched results land via "done". onPartial-less
          // callers silently drop this — safe legacy behavior.
          p.onPartial?.(e.data.results);
        } else if (type === "done") {
          pendingRef.current.delete(id);
          p.resolve(e.data);
        } else if (type === "error") {
          pendingRef.current.delete(id);
          p.reject(new Error(e.data.message));
        }
      });
      workerRef.current.addEventListener("error", (ev) => {
        const msg = ev?.message || ev?.error?.message || "Worker failed to load or crashed";
        for (const [, p] of pendingRef.current) p.reject(new Error(msg));
        pendingRef.current.clear();
      });
      workerRef.current.addEventListener("messageerror", (ev) => {
        for (const [, p] of pendingRef.current) p.reject(new Error("Worker message deserialization failed: " + (ev?.data ?? "")));
        pendingRef.current.clear();
      });
    }
    return workerRef.current;
  }, []);

  const runDiff = useCallback((oldSpecOrText, newSpecOrText, { onProgress, onPartial } = {}) => {
    const w = ensureWorker();
    const id = ++seqRef.current;
    return new Promise((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject, onProgress, onPartial });
      // Strings → worker parses (parsing + structuredClone-via-postMessage
      // both stay off the main thread). Objects → legacy path for callers
      // that already have parsed data.
      const payload = typeof oldSpecOrText === "string" && typeof newSpecOrText === "string"
        ? { id, oldText: oldSpecOrText, newText: newSpecOrText }
        : { id, oldSpec: oldSpecOrText, newSpec: newSpecOrText };
      w.postMessage(payload);
    });
  }, [ensureWorker]);

  const cancel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    for (const [, p] of pendingRef.current) p.reject(new Error("cancelled"));
    pendingRef.current.clear();
  }, []);

  useEffect(() => () => {
    if (workerRef.current) workerRef.current.terminate();
    workerRef.current = null;
    pendingRef.current.clear();
  }, []);

  return { runDiff, cancel };
}
