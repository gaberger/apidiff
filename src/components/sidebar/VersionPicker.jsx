import { useState, useMemo, useEffect } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { specProxy } from "@/lib/spec-proxy";
import { groupByProduct } from "@/lib/domain/product-extractor.js";

const STORAGE_PREFIX = "apidiff:lastProduct:";

export default function VersionPicker({ provider, onSelectComparison }) {
  const [v1Idx, setV1Idx] = useState(null);
  const [v2Idx, setV2Idx] = useState(null);
  const [loading, setLoading] = useState(false);

  const allVersions = provider.versions || [];
  const providerSlug = (provider.slug || provider.name || "").toLowerCase();

  // Group versions by product — returns [{ product: {key,name}|undefined, versions: [...] }, ...]
  const groups = useMemo(
    () => groupByProduct(allVersions, providerSlug),
    [allVersions, providerSlug],
  );
  const hasProducts = groups.length > 1;

  const [productKey, setProductKey] = useState(() => {
    if (!hasProducts) return "";
    try {
      const saved = window.localStorage.getItem(STORAGE_PREFIX + providerSlug);
      if (saved && groups.some((g) => (g.product?.key ?? "") === saved)) return saved;
    } catch { /* localStorage unavailable — default below */ }
    return groups[0]?.product?.key ?? "";
  });

  // Reset product + selections whenever the provider changes.
  useEffect(() => {
    setV1Idx(null);
    setV2Idx(null);
    if (!hasProducts) {
      setProductKey("");
      return;
    }
    let next = groups[0]?.product?.key ?? "";
    try {
      const saved = window.localStorage.getItem(STORAGE_PREFIX + providerSlug);
      if (saved && groups.some((g) => (g.product?.key ?? "") === saved)) next = saved;
    } catch { /* ignore */ }
    setProductKey(next);
  }, [providerSlug, hasProducts, groups]);

  const activeGroup = useMemo(() => {
    if (!hasProducts) return groups[0];
    return groups.find((g) => (g.product?.key ?? "") === productKey) ?? groups[0];
  }, [groups, productKey, hasProducts]);
  const versions = activeGroup?.versions ?? [];

  function handleProductChange(nextKey) {
    setProductKey(nextKey);
    setV1Idx(null);
    setV2Idx(null);
    try {
      window.localStorage.setItem(STORAGE_PREFIX + providerSlug, nextKey);
    } catch { /* ignore */ }
  }

  async function handleCompare() {
    if (v1Idx === null || v2Idx === null || v1Idx === v2Idx) return;
    const v1 = versions[v1Idx];
    const v2 = versions[v2Idx];
    const productLabel = activeGroup?.product?.name ? ` · ${activeGroup.product.name}` : "";
    const label = `${provider.name}${productLabel}: ${v1.label} → ${v2.label}`;

    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        specProxy.fetch(v1.url).then(r => r.document),
        specProxy.fetch(v2.url).then(r => r.document),
      ]);
      onSelectComparison(r1, r2, label);
    } finally {
      setLoading(false);
    }
  }

  if (allVersions.length === 0) return null;

  return (
    <div className="px-3 pl-6 py-2 space-y-1.5">
      {hasProducts && (
        <>
          <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            Product ({groups.length})
          </div>
          <select
            value={productKey}
            onChange={(e) => handleProductChange(e.target.value)}
            className="w-full text-[11px] px-1.5 py-1 rounded border border-border bg-white dark:bg-secondary text-foreground focus:outline-none focus:border-ring dark:focus:border-ring truncate"
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
        </>
      )}
      <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
        Pick two versions{hasProducts ? ` · ${versions.length} available` : ""}
      </div>
      <div className="flex gap-1.5 items-center">
        <select
          value={v1Idx ?? ""}
          onChange={(e) => setV1Idx(e.target.value === "" ? null : Number(e.target.value))}
          className="flex-1 text-[11px] px-1.5 py-1 rounded border border-border bg-white dark:bg-secondary text-foreground focus:outline-none focus:border-ring dark:focus:border-ring truncate"
        >
          <option value="">Old…</option>
          {versions.map((v, i) => (
            <option key={i} value={i} disabled={i === v2Idx}>
              {v.label}
            </option>
          ))}
        </select>
        <ArrowRight className="w-3 h-3 text-muted-foreground/70 flex-shrink-0" />
        <select
          value={v2Idx ?? ""}
          onChange={(e) => setV2Idx(e.target.value === "" ? null : Number(e.target.value))}
          className="flex-1 text-[11px] px-1.5 py-1 rounded border border-border bg-white dark:bg-secondary text-foreground focus:outline-none focus:border-ring dark:focus:border-ring truncate"
        >
          <option value="">New…</option>
          {versions.map((v, i) => (
            <option key={i} value={i} disabled={i === v1Idx}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={handleCompare}
        disabled={v1Idx === null || v2Idx === null || v1Idx === v2Idx || loading}
        className="w-full text-[11px] font-medium py-1 rounded bg-secondary text-white hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
      >
        {loading ? (
          <><Loader2 className="w-3 h-3 animate-spin" /> Loading…</>
        ) : (
          "Compare"
        )}
      </button>
    </div>
  );
}