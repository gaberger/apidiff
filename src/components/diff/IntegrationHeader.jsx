import { useState, useMemo, useEffect } from "react";
import { Loader2, X, GitCompareArrows } from "lucide-react";
import { groupByProduct } from "@/lib/domain/product-extractor.js";
import { fetchSpec } from "@/lib/fetch-spec.js";
import { prettyVersionLabel } from "@/lib/version-label.js";
import VersionTimeline from "@/components/diff/VersionTimeline.jsx";

const STORAGE_PREFIX = "apidiff:lastProduct:";

export default function IntegrationHeader({ integration, onLoadSpecs, onClear, onProgress }) {
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

    const stages = [
      { id: "v1", label: `Fetching ${prettyVersionLabel(v1.label)}`, status: "pending", cacheHit: false },
      { id: "v2", label: `Fetching ${prettyVersionLabel(v2.label)}`, status: "pending", cacheHit: false },
    ];
    const push = () => onProgress?.(stages.map((s) => ({ ...s })));

    const makeCallback = (stageId) => (evt) => {
      const stage = stages.find((s) => s.id === stageId);
      if (!stage) return;
      if (evt.stage === "cache-hit") { stage.status = "complete"; stage.cacheHit = true; }
      else if (evt.stage === "fetching") { stage.status = "in-progress"; }
      else if (evt.stage === "done") { stage.status = "complete"; }
      else if (evt.stage === "error") { stage.status = "error"; stage.error = evt.message; }
      push();
    };

    setLoading(true);
    push();
    try {
      const r1 = await fetchSpec(v1.url, { onProgress: makeCallback("v1") });
      const r2 = await fetchSpec(v2.url, { onProgress: makeCallback("v2") });
      const categoryLabel = hasProducts && activeGroup?.product?.name ? ` \u00b7 ${activeGroup.product.name}` : "";
      onLoadSpecs(r1, r2, `${integration.name}${categoryLabel}: ${prettyVersionLabel(v1.label)} \u2192 ${prettyVersionLabel(v2.label)}`);
    } catch (err) {
      const lastActive = stages.find((s) => s.status === "in-progress");
      if (lastActive) { lastActive.status = "error"; lastActive.error = err?.message ?? "fetch failed"; }
      push();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-xl border p-3 sm:p-4 mb-4 shadow-e1 transition-shadow duration-base ease-standard"
      style={{ borderColor: color + "30", background: color + "08" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {integration.logo_url?.trim() ? (
            <img src={integration.logo_url} alt="" className="w-7 h-7 object-contain rounded" />
          ) : (
            <div className="w-7 h-7 rounded-full" style={{ background: color }} />
          )}
          <div className="flex flex-col">
            <span className="font-semibold text-sm text-foreground">{integration.name}</span>
            <span className="t-meta">
              {versions.length} version{versions.length !== 1 ? "s" : ""} discovered
            </span>
          </div>
        </div>
        <button
          onClick={onClear}
          aria-label="Clear integration"
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors duration-fast"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {versions.length > 0 ? (
        <div className="flex flex-col gap-3">
          {hasProducts && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="t-meta">Category</span>
              {groups.map((g) => {
                const key = g.product?.key ?? "";
                const name = g.product?.name ?? "All";
                const active = key === productKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleProductChange(key)}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-all duration-fast ease-standard ${
                      active
                        ? "bg-foreground text-background border-transparent shadow-e1"
                        : "bg-card text-muted-foreground border-border hover:text-foreground hover:shadow-e1"
                    }`}
                  >
                    {name} <span className="opacity-60">({g.versions.length})</span>
                  </button>
                );
              })}
            </div>
          )}

          <VersionTimeline
            versions={activeVersions}
            selectedV1Idx={v1Idx}
            selectedV2Idx={v2Idx}
            onSelect={({ v1Idx: a, v2Idx: b }) => { setV1Idx(a); setV2Idx(b); }}
            accentColor={color}
          />

          <div className="flex items-center justify-end">
            <button
              onClick={handleCompare}
              disabled={v1Idx === null || v2Idx === null || v1Idx === v2Idx || loading}
              className="px-4 py-2 text-xs font-semibold rounded-md text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-fast ease-standard flex items-center gap-1.5 shadow-e1 hover:shadow-e2 hover:-translate-y-px disabled:translate-y-0 disabled:shadow-none"
              style={{ background: color }}
            >
              {loading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading specs…</>
              ) : (
                <><GitCompareArrows className="w-3.5 h-3.5" /> Load & Compare</>
              )}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          No versions discovered yet. Use Settings to run discovery or paste specs manually below.
        </p>
      )}
    </div>
  );
}