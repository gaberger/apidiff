import { base44 } from "@/api/base44Client";
import * as specCache from "@/lib/spec-cache.js";

export class SpecFetchError extends Error {
  constructor(message, { url, phase, cause } = {}) {
    super(message);
    this.name = "SpecFetchError";
    this.url = url;
    this.phase = phase;
    this.cause = cause;
  }
}

function emit(onProgress, stage, extra = {}) {
  try { onProgress?.({ stage, ...extra }); } catch { /* swallow */ }
}

export async function fetchSpec(url, { onProgress, bypassCache = false } = {}) {
  if (!url) throw new SpecFetchError("URL is required", { url, phase: "validate" });

  emit(onProgress, "cache-lookup", { url });
  if (!bypassCache) {
    const cached = specCache.get(url);
    if (cached) {
      emit(onProgress, "cache-hit", { url });
      return cached;
    }
  }

  emit(onProgress, "fetching", { url });
  let document;
  try {
    const response = await base44.functions.invoke("proxyFetch", { url });
    document = response?.data?.document;
  } catch (err) {
    emit(onProgress, "error", { url, phase: "fetch", message: err?.message });
    throw new SpecFetchError(
      `Fetch failed: ${err?.message ?? "unknown error"}`,
      { url, phase: "fetch", cause: err },
    );
  }

  if (typeof document !== "string" || document.length === 0) {
    emit(onProgress, "error", { url, phase: "parse", message: "Empty response" });
    throw new SpecFetchError("Empty response from proxy", { url, phase: "parse" });
  }

  emit(onProgress, "caching", { url, size: document.length });
  specCache.put(url, document);

  emit(onProgress, "done", { url, size: document.length });
  return document;
}
