const KEY_PREFIX = "apidiff:spec:";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRY_BYTES = 3_500_000;

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

function keyFor(url) {
  return KEY_PREFIX + hash(url);
}

function safeGetItem(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSetItem(k, v) {
  try { localStorage.setItem(k, v); return true; } catch { return false; }
}
function safeRemoveItem(k) {
  try { localStorage.removeItem(k); } catch { /* ignore */ }
}

function listEntries() {
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(KEY_PREFIX)) continue;
      const raw = safeGetItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        entries.push({ key: k, fetched_at: parsed.fetched_at ?? 0, size_bytes: parsed.size_bytes ?? raw.length });
      } catch { safeRemoveItem(k); }
    }
  } catch { /* ignore */ }
  return entries;
}

function evictOldestUntilFits(neededBytes) {
  const entries = listEntries().sort((a, b) => a.fetched_at - b.fetched_at);
  let freed = 0;
  for (const e of entries) {
    if (freed >= neededBytes) return true;
    safeRemoveItem(e.key);
    freed += e.size_bytes;
  }
  return freed >= neededBytes;
}

export function get(url) {
  const raw = safeGetItem(keyFor(url));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.content) return null;
    if (parsed.expires_at && Date.now() > parsed.expires_at) {
      safeRemoveItem(keyFor(url));
      return null;
    }
    return parsed.content;
  } catch {
    safeRemoveItem(keyFor(url));
    return null;
  }
}

export function put(url, content) {
  if (typeof content !== "string") return false;
  const size_bytes = content.length;
  if (size_bytes > MAX_ENTRY_BYTES) return false;

  const now = Date.now();
  const entry = JSON.stringify({
    url,
    fetched_at: now,
    expires_at: now + TTL_MS,
    size_bytes,
    content,
  });

  if (safeSetItem(keyFor(url), entry)) return true;
  if (evictOldestUntilFits(entry.length) && safeSetItem(keyFor(url), entry)) return true;
  return false;
}

export function purge() {
  const entries = listEntries();
  let freedBytes = 0;
  for (const e of entries) {
    freedBytes += e.size_bytes;
    safeRemoveItem(e.key);
  }
  return { cleared: entries.length, freedBytes };
}

export function stats() {
  const entries = listEntries();
  const totalBytes = entries.reduce((n, e) => n + e.size_bytes, 0);
  return { count: entries.length, totalBytes };
}
