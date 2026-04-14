import { useState, useMemo, useEffect } from "react";
import { ArrowRight, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { groupByProduct } from "@/lib/domain/product-extractor.js";

const STORAGE_PREFIX = "apidiff:lastProduct:";

export default function IntegrationHeader({ integration, onLoadSpecs, onClear }) {
  const [v1Idx, setV1Idx] = useState(null);
  const [v2Idx, setV2Idx] = useState(null);
  const [loading, setLoading] = useState(false);

  const versions = integration.versions || [];
  const color = integration.color || "#666";
  const slug = (integration.slug || integration.name || "").toLowerCase();

  // Index-preserving grouping: v1Idx/v2Idx state indexes into the flat `versions`
  // array, so we keep each version's original index via __idx during grouping.
  const groups = useMemo(() => {
    if (versions.length === 0) return [];
    const indexed = versions.map((v, idx) => ({ ...v, __idx: idx }));
    return groupByProduct(indexed, slug);
  }, [versions, slug]);
  const hasProducts = groups.length > 1;

  const [productKey, setProductKey] = useState("");

  // Reset product + version picks whenever the integration changes; hydrate
  // productKey from localStorage when available and still valid.
  useEffect(() => {
    setV1Idx(null);
    setV2Idx(null);
    if (!hasProducts) {
      setProductKey("");
      return;
    }
    let next = groups[0]?.product?.key ?? "";
    try {
      const saved = window.localStorage.getItem(STORAGE_PREFIX + slug);
      if (saved && groups.some((g) => (g.product?.key ?? "") === saved)) next = saved;
    } catch { /* ignore */ }
    setProductKey(next);
  }, [integration.id, slug, hasProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeGroup = useMemo(() => {
    if (!hasProducts) return groups[0];
    return groups.find((g) => (g.product?.key ?? "") === productKey) ?? groups[0];
  }, [groups, productKey, hasProducts]);
  const activeVersions = activeGroup?.versions ?? [];

  function handleProductChange(nextKey) {
    setProductKey(nextKey);
    setV1Idx(null);
    setV2Idx(null);
    try { window.localStorage.setItem(STORAGE_PREFIX + slug, nextKey); } catch { /* ignore */ }
  }

  async function handleCompare() {
    if (v1Idx === null || v2Idx === null || v1Idx === v2Idx) return;
    const v1 = versions[v1Idx];
    const v2 = versions[v2Idx];

    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        base44.functions.invoke('proxyFetch', { url: v1.url }).then(r => r.data.document),
        base44.functions.invoke('proxyFetch', { url: v2.url }).then(r => r.data.document),
      ]);
      const categoryLabel = hasProducts && activeGroup?.product?.name ? ` · ${activeGroup.product.name}` : "";
      onLoadSpecs(r1, r2, `${integration.name}${categoryLabel}: ${v1.label} → ${v2.label}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-lg border p-3 sm:p-4 mb-4"
      style={{ borderColor: color + "40", background: color + "08" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {integration.logo_url?.trim() ? (
            <img src={integration.logo_url} alt="" className="w-6 h-6 object-contain rounded" />
          ) : (
            <div className="w-6 h-6 rounded-full" style={{ background: color }} />
          )}
          <span className="font-semibold text-sm text-stone-800">{integration.name}</span>
          <span className="text-[11px] text-stone-400">{versions.length} version{versions.length !== 1 ? "s" : ""}</span>
        </div>
        <button onClick={onClear} className="p-1 rounded hover:bg-stone-200 text-stone-400">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {versions.length > 0 ? (
        <div className="flex flex-col gap-2">
          {hasProducts && (
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 flex-shrink-0">
                Category
              </label>
              <select
                value={productKey}
                onChange={(e) => handleProductChange(e.target.value)}
                className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-300"
              >
                {groups.map((g) => {
                  const key = g.product?.key ?? "";
                  const name = g.product?.name ?? "All versions";
                  return (
                    <option key={key} value={key}>
                      {name} ({g.versions.length})
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={v1Idx ?? ""}
              onChange={(e) => setV1Idx(e.target.value === "" ? null : Number(e.target.value))}
              className="flex-1 min-w-[120px] text-xs px-2.5 py-1.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-300"
            >
              <option value="">Select old version…</option>
              {activeVersions.map((v) => (
                <option key={v.__idx ?? v.url} value={v.__idx ?? ""} disabled={v.__idx === v2Idx}>
                  {v.label}
                </option>
              ))}
            </select>

            <ArrowRight className="w-4 h-4 text-stone-300 flex-shrink-0" />

            <select
              value={v2Idx ?? ""}
              onChange={(e) => setV2Idx(e.target.value === "" ? null : Number(e.target.value))}
              className="flex-1 min-w-[120px] text-xs px-2.5 py-1.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-300"
            >
              <option value="">Select new version…</option>
              {activeVersions.map((v) => (
                <option key={v.__idx ?? v.url} value={v.__idx ?? ""} disabled={v.__idx === v1Idx}>
                  {v.label}
                </option>
              ))}
            </select>

            <button
              onClick={handleCompare}
              disabled={v1Idx === null || v2Idx === null || v1Idx === v2Idx || loading}
              className="px-4 py-1.5 text-xs font-semibold rounded-md text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              style={{ background: color }}
            >
              {loading ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Loading…</>
              ) : (
                "Load Specs"
              )}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-stone-400 italic">
          No versions discovered yet. Use Settings to run discovery or paste specs manually below.
        </p>
      )}
    </div>
  );
}