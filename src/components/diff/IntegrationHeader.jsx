import { useState, useMemo, useEffect, useRef } from "react";
import { Loader2, X, GitCompareArrows, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { groupByProduct } from "@/lib/domain/product-extractor.js";
import { fetchSpec } from "@/lib/fetch-spec.js";
import VersionTimeline from "@/components/diff/VersionTimeline.jsx";
import { discoveryService, releaseNotesService } from "@/lib/browser-stores";
import { releaseNotesToChangeset } from "@/lib/release-notes-to-changeset.js";

const STORAGE_PREFIX = "apidiff:lastProduct:";

// Pretty version label without the buggy stripping
function prettyVersionLabel(label) {
  if (!label) return "";
  return String(label).trim();
}

export default function IntegrationHeader({ integration, onLoadSpecs, onClear, onProgress }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [v1Idx, setV1Idx] = useState(null);
  const [v2Idx, setV2Idx] = useState(null);
  const [loading, setLoading] = useState(false);
  const [discoveredVersions, setDiscoveredVersions] = useState(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState(null);

  // Reset discovery state when the integration changes
  useEffect(() => {
    setDiscoveredVersions(null);
    setDiscoverError(null);
  }, [integration.slug]);

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const result = await discoveryService.discoverProvider(integration.slug);
      const vers = (result?.versions || []).map((v) => ({
        label: v.label || v.version || v.url || "unknown",
        url: v.url,
        from: v.released_at || v.date,
        to: v.released_at || v.date,
      }));
      if (vers.length === 0) {
        setDiscoverError("Discovery returned 0 versions. Try the Discovery page to debug.");
      } else {
        setDiscoveredVersions(vers);
      }
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  const versions = discoveredVersions ?? integration.versions ?? [];
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
  // Only clear version selection if no URL params exist
  useEffect(() => {
    if (!searchParams.get("v1") && !searchParams.get("v2")) {
      setV1Idx(null);
      setV2Idx(null);
    }
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
  }, [integration.id, slug, hasProducts, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeGroup = useMemo(() => {
    if (!hasProducts) return groups[0];
    return groups.find((g) => (g.product?.key ?? "") === productKey) ?? groups[0];
  }, [groups, productKey, hasProducts]);
  const activeVersions = activeGroup?.versions ?? [];

  // Sync version selection to URL
  useEffect(() => {
    if (v1Idx !== null) {
      const v1Label = versions[v1Idx]?.label;
      const v2Label = v2Idx !== null ? versions[v2Idx]?.label : null;
      const params = new URLSearchParams(searchParams);
      if (v1Label) params.set("v1", v1Label);
      if (v2Label) params.set("v2", v2Label);
      else params.delete("v2");
      setSearchParams(params, { replace: true });
    }
  }, [v1Idx, v2Idx, versions, searchParams, setSearchParams]);

  // Read version selection from URL on mount
  useEffect(() => {
    const v1Param = searchParams.get("v1");
    const v2Param = searchParams.get("v2");
    if (versions.length > 0) {
      const v1Found = v1Param ? versions.findIndex(v => v.label === v1Param) : -1;
      const v2Found = v2Param ? versions.findIndex(v => v.label === v2Param) : -1;
      if (v1Found >= 0) setV1Idx(v1Found);
      if (v2Found >= 0) setV2Idx(v2Found);
    }
  }, [versions, searchParams]);

  // Auto-fire the comparison once when both versions were restored from URL
  // (so the URL is a self-contained shareable link). Gated by a ref so the
  // user's subsequent picks don't re-trigger.
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (autoLoadedRef.current) return;
    if (v1Idx === null || v2Idx === null || v1Idx === v2Idx) return;
    if (!searchParams.get("v1") || !searchParams.get("v2")) return;
    if (versions.length === 0) return;
    autoLoadedRef.current = true;
    handleCompare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v1Idx, v2Idx, versions.length]);

  function handleProductChange(nextKey) {
    setProductKey(nextKey);
    setV1Idx(null);
    setV2Idx(null);
    try { window.localStorage.setItem(STORAGE_PREFIX + slug, nextKey); } catch { /* ignore */ }
  }

  const isReleaseNotes = integration.isReleaseNotes;
  const isFwdNetworks = integration.slug === "forward-networks";
  // Generalized: any provider with a registered ReleaseNotesPort adapter
  // participates in the release-notes flow. isFwdNetworks stays for the
  // FWD-specific spec-URL shortcut path (versionHasSpecs / getFwdUrls),
  // which is a distinct concern from release-notes and will migrate out
  // when a "direct-spec-URLs" port lands.
  const hasReleaseNotesAdapter = releaseNotesService.has(slug);
  const hasFwdReleaseNotes = hasReleaseNotesAdapter && versions.some((v) => v?.diff);

  // Synthesize OpenAPI spec from release notes diff
  function synthesizeSpecFromReleaseNotes(version, prevVersion) {
    const spec = {
      openapi: "3.0.0",
      info: {
        title: `Forward Networks API ${version.label}`,
        version: version.label,
        description: `Release notes for version ${version.label}`
      },
      paths: {},
      components: {
        schemas: {}
      }
    };

    if (!version.diff) return spec;

    // Add new operations as path items
    for (const op of version.diff.newOperations?.added || []) {
      const path = `/new-operations/${op.title.toLowerCase().replace(/\s+/g, '-')}`;
      spec.paths[path] = {
        get: {
          summary: op.title,
          description: op.description,
          operationId: op.title
        }
      };
    }

    // Add breaking changes as removed operations
    for (const change of version.diff.breakingChanges?.added || []) {
      const path = `/breaking/${change.title.toLowerCase().replace(/\s+/g, '-')}`;
      spec.paths[path] = {
        delete: {
          summary: `[BREAKING] ${change.title}`,
          description: change.description,
          operationId: change.title
        }
      };
    }

    // Add new models as schemas
    for (const model of version.diff.newModels?.added || []) {
      spec.components.schemas[model.title] = {
        type: "object",
        description: model.description
      };
    }

    // Add model changes
    for (const change of version.diff.modelChanges?.added || []) {
      spec.components.schemas[change.title] = {
        type: "object",
        description: `[MODEL CHANGE] ${change.description}`,
        "x-change-type": "modified"
      };
    }

    return spec;
  }

  // Known versions that have actual OpenAPI specs
  const FWD_VERSIONS_WITH_SPECS = ["26.3", "26.2"];

  // Construct URL for Forward Networks versions - try both URL patterns
  function getFwdUrls(rawLabel) {
    const match = rawLabel.match(/^(\d+\.\d+)/);
    const version = match ? match[1] : rawLabel.replace(/[^\d.]/g, '');
    // Try both URL patterns - newer versions use /api/, older use /api-doc/api/
    return [
      `https://docs.fwd.app/${version}/api/spec/complete.json`,
      `https://docs.fwd.app/${version}/api-doc/api/spec/complete.json`,
    ];
  }

  function canDiffWithSpecs(versionLabel) {
    const match = versionLabel.match(/^(\d+\.\d+)/);
    const version = match ? match[1] : versionLabel.replace(/[^\d.]/g, '');
    return FWD_VERSIONS_WITH_SPECS.includes(version);
  }

  // Check if a version has actual OpenAPI specs available
  function versionHasSpecs(label) {
    const versionMatch = label.match(/^(\d+)\.(\d+)/);
    if (!versionMatch) return false;
    const versionNum = parseInt(versionMatch[1]) * 100 + parseInt(versionMatch[2]);
    return versionNum >= 2510; // 25.10+
  }

  async function handleCompare() {
    // Handle Forward Networks - check if we should fetch actual specs or fall back to release notes
    if (isFwdNetworks && v1Idx !== null) {
      const v = versions[v1Idx];
      const hasSpecs = versionHasSpecs(v.label);
      
      // If version has specs, fetch and diff them
      if (hasSpecs) {
        const urls = getFwdUrls(v.label);
        
        for (const url of urls) {
          try {
            const spec = await fetchSpec(url);
            
            // Fetch previous version for comparison
            const prevIdx = v1Idx + 1;
            let prevSpec = null;
            if (prevIdx < versions.length) {
              const prevV = versions[prevIdx];
              if (versionHasSpecs(prevV.label)) {
                const prevUrls = getFwdUrls(prevV.label);
                for (const prevUrl of prevUrls) {
                  try {
                    prevSpec = await fetchSpec(prevUrl);
                    break;
                  } catch { /* try next URL */ }
                }
              }
            }
            
            onLoadSpecs(prevSpec || "{}", spec, `${integration.name}: ${v.label}`, { 
              type: "specDiff",
              diff: v.diff || {},
              stats: { ...v.stats, breaking: v.breaking }
            });
            return;
          } catch (err) {
            console.log("[FWD] Failed to fetch from", url, err.message);
          }
        }
      }
      
      // Fall back to release notes if no specs available
      if (hasFwdReleaseNotes && v.diff) {
        if (v2Idx !== null && v2Idx !== v1Idx) {
          // Two-version release-notes comparison. The port handles range
          // aggregation per provider — IntegrationHeader no longer knows
          // whether the underlying data is newest-first / oldest-first or
          // whether any particular bucket applies. Adapter returns a
          // canonical AggregateDiff with chronological from/to.
          const idxNewer = Math.min(v1Idx, v2Idx);
          const idxOlder = Math.max(v1Idx, v2Idx);
          const newer = versions[idxNewer];
          const older = versions[idxOlder];

          const aggregatedDiff = await releaseNotesService.fetchRange(slug, older.label, newer.label);
          const label = `${integration.name} ${aggregatedDiff.from} → ${aggregatedDiff.to} - Release Notes Comparison`;

          const beforeSpec = synthesizeSpecFromReleaseNotes(older, null);
          const afterSpec = synthesizeSpecFromReleaseNotes(newer, older);

          const changesetData = {
            versions: versions.map((vx) => ({
              version: vx.label,
              releaseDate: vx.from,
              year: vx.from ? new Date(vx.from).getFullYear() : undefined,
            })),
          };
          const changeset = releaseNotesToChangeset(changesetData, aggregatedDiff, {
            apiName: integration.name,
          });

          const aggregatedStats = {
            breaking: aggregatedDiff.breakingChanges.added.length,
            scheduledBreaking: aggregatedDiff.scheduledBreakingChanges.added.length,
            newOperations: aggregatedDiff.newOperations.added.length,
            newModels: aggregatedDiff.newModels.added.length,
            modelChanges: aggregatedDiff.modelChanges.added.length,
          };

          onLoadSpecs(beforeSpec, afterSpec, label, {
            type: "releaseNotes",
            diff: aggregatedDiff,
            stats: aggregatedStats,
            changeset,
          });
          return;
        } else {
          // Single version - show its release notes
          const label = `${integration.name} ${v.label} (${v.from}) - Synthesized from Release Notes`;
          const afterSpec = synthesizeSpecFromReleaseNotes(v, null);
          const beforeSpec = { 
            ...afterSpec, 
            info: { ...afterSpec.info, title: `${integration.name} previous version` }
          };
          beforeSpec.paths = {};
          beforeSpec.components.schemas = {};
          
          onLoadSpecs(beforeSpec, afterSpec, label, { 
            type: "releaseNotes", 
            diff: v.diff, 
            stats: { ...v.stats, breaking: v.breaking } 
          });
          return;
        }
      }
      
      // No specs and no release notes
      return;
    }

    // For other integrations (non-FWD), use the standard URL-based flow
    if (v1Idx === null || v2Idx === null || v1Idx === v2Idx) return;
    let v1 = versions[v1Idx];
    let v2 = versions[v2Idx];

    const stages = [
      { id: "v1", label: `Fetching ${v1.label}`, status: "pending", cacheHit: false, url: v1.url },
      { id: "v2", label: `Fetching ${v2.label}`, status: "pending", cacheHit: false, url: v2.url },
    ];
    const push = () => onProgress?.(stages.map((s) => ({ ...s })));

    const makeCallback = (stageId) => (evt) => {
      const stage = stages.find((s) => s.id === stageId);
      if (!stage) return;
      if (evt.stage === "cache-hit") { stage.status = "complete"; stage.cacheHit = true; }
      else if (evt.stage === "fetching") { stage.status = "in-progress"; }
      else if (evt.stage === "done") { stage.status = "complete"; }
      else if (evt.stage === "error") { 
        stage.status = "error"; 
        stage.message = evt.message || evt.error || "Unknown error";
        console.log("[FETCH ERROR] Stage:", stageId, "Error:", stage.message);
      }
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
      if (lastActive) { 
        lastActive.status = "error"; 
        lastActive.error = err?.message ?? "fetch failed"; 
        lastActive.message = err?.message ?? "fetch failed";
      }
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
          {hasProducts && !isReleaseNotes && (
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

          <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2">
            {isFwdNetworks && v1Idx !== null && !canDiffWithSpecs(versions[v1Idx]?.label || "") && !versions[v1Idx]?.diff && (
              <span className="text-xs text-amber-600 dark:text-amber-400 mr-auto">
                No specs or release notes available for this version
              </span>
            )}
            <button
              onClick={handleCompare}
              disabled={loading || v1Idx === null || (isFwdNetworks && !canDiffWithSpecs(versions[v1Idx]?.label || "") && !versions[v1Idx]?.diff)}
              className="px-4 py-2 text-xs font-semibold rounded-md text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-fast ease-standard flex items-center gap-1.5 shadow-e1 hover:shadow-e2 hover:-translate-y-px disabled:translate-y-0 disabled:shadow-none"
              style={{ background: color }}
            >
              {loading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</>
              ) : (
                <><GitCompareArrows className="w-3.5 h-3.5" /> Diff {versions[v1Idx]?.label} {isFwdNetworks && versionHasSpecs(versions[v1Idx]?.label || "") ? "Specs" : "Release Notes"}</>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground italic">
            No versions discovered yet. Discover them now or paste specs manually below.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDiscover}
              disabled={discovering}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {discovering ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Discovering…</>
              ) : (
                <><Search className="w-3.5 h-3.5" /> Discover versions</>
              )}
            </button>
            {discoverError && (
              <span className="text-xs text-red-600 dark:text-red-400">{discoverError}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}