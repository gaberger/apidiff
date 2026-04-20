import { specProxy, schemaCache, schemaUrlRegistry } from "@/lib/browser-stores";

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
    const cached = await schemaCache.get(url);
    if (cached?.content) {
      emit(onProgress, "cache-hit", { url });
      return cached.content;
    }
  }

  emit(onProgress, "fetching", { url });
  let response;
  try {
    response = await specProxy.fetch(url);
  } catch (err) {
    const msg = err?.message || "unknown error";
    emit(onProgress, "error", { url, phase: "fetch", message: msg });
    throw new SpecFetchError(`Fetch failed: ${msg}`, { url, phase: "fetch", cause: err });
  }

  const document = response?.document;
  if (document == null) {
    emit(onProgress, "error", { url, phase: "parse", message: "Empty response from proxy" });
    throw new SpecFetchError("Empty response from proxy", { url, phase: "parse" });
  }

  // specProxy returns `document` as a parsed object (JSON) or string (YAML /
  // raw text). Normalize to string for caching + downstream parsing.
  const content = typeof document === "string"
    ? document
    : JSON.stringify(document, null, 2);

  if (content.length === 0) {
    emit(onProgress, "error", { url, phase: "parse", message: "Empty document" });
    throw new SpecFetchError("Empty document", { url, phase: "parse" });
  }

  emit(onProgress, "caching", { url, size: content.length });
  // Fire-and-forget — persistence failures must not break the fetch flow.
  void schemaCache.put(url, content).catch(() => {});
  void schemaUrlRegistry.touchFetched(url).catch(() => {});

  emit(onProgress, "done", { url, size: content.length });
  return content;
}
