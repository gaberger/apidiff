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
  let response;
  try {
    response = await base44.functions.invoke("proxyFetch", { url });
  } catch (err) {
    const msg = err?.response?.data?.error || err?.message || "unknown error";
    emit(onProgress, "error", { url, phase: "fetch", message: msg });
    throw new SpecFetchError(`Fetch failed: ${msg}`, { url, phase: "fetch", cause: err });
  }

  const data = response?.data;
  if (data?.error) {
    emit(onProgress, "error", { url, phase: "proxy", message: data.error });
    throw new SpecFetchError(data.error, { url, phase: "proxy" });
  }

  const document = data?.document;
  if (document == null) {
    emit(onProgress, "error", { url, phase: "parse", message: "Empty response from proxy" });
    throw new SpecFetchError("Empty response from proxy", { url, phase: "parse" });
  }

  // proxyFetch may return `document` as a parsed object (when it auto-parsed
  // JSON) or as a string (for YAML / raw text). Normalize to string for both
  // caching and downstream parsing, which expects a string.
  const content = typeof document === "string"
    ? document
    : JSON.stringify(document, null, 2);

  if (content.length === 0) {
    emit(onProgress, "error", { url, phase: "parse", message: "Empty document" });
    throw new SpecFetchError("Empty document", { url, phase: "parse" });
  }

  emit(onProgress, "caching", { url, size: content.length });
  specCache.put(url, content);

  emit(onProgress, "done", { url, size: content.length });
  return content;
}
