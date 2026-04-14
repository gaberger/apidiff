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

  const runDiff = useCallback((oldSpec, newSpec, { onProgress } = {}) => {
    const w = ensureWorker();
    const id = ++seqRef.current;
    return new Promise((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject, onProgress });
      w.postMessage({ id, oldSpec, newSpec });
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
