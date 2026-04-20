import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { schemaCache, schemaUrlRegistry, integrationStore } from "@/lib/browser-stores";
import { PROVIDER_REGISTRY } from "@/lib/domain/provider-registry.js";
import DiscoveryPanel from "@/components/settings/DiscoveryPanel";

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// Map a hostname back to a registry provider (e.g. docs.fwd.app → forward-networks)
// so the created Integration keeps the curated slug + category the sidebar expects.
function matchRegistry(hostname) {
  if (!hostname) return null;
  return PROVIDER_REGISTRY.find((p) => {
    if (p.specSource.kind === "docusaurus") return hostnameOf(p.specSource.baseUrl) === hostname;
    if (p.specSource.kind === "url") return p.specSource.specUrls.some((u) => hostnameOf(u.url) === hostname);
    return false;
  }) || null;
}

function formatBytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function Discovery() {
  const [urls, setUrls] = useState([]);
  const [cacheStats, setCacheStats] = useState({ count: 0, totalBytes: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, stats] = await Promise.all([
        schemaUrlRegistry.list(),
        schemaCache.stats(),
      ]);
      setUrls(list);
      setCacheStats(stats);
    } catch (e) {
      setError(e?.message || "Failed to load discovery data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleRemove(id) {
    try {
      await schemaUrlRegistry.remove(id);
      await refresh();
    } catch (e) {
      setError(e?.message || "Failed to remove URL");
    }
  }

  async function handleAddDiscovered(pairs, versions) {
    try {
      const firstUrl = versions?.[0]?.url || pairs?.[0]?.v1_url;
      const host = hostnameOf(firstUrl);
      const match = matchRegistry(host);
      const draft = {
        name: match?.name || host || "Discovered API",
        slug: match?.slug || host.replace(/\./g, "-"),
        category: match?.category,
        color: "#635BFF",
        versions: (versions || []).map((v) => ({ label: v.label, url: v.url })),
        comparisons: (pairs || []).map((p) => ({ label: p.label, v1_url: p.v1_url, v2_url: p.v2_url })),
      };
      const existing = await integrationStore.list();
      const dupe = existing.find((i) => {
        const d = i.data || i;
        return d.slug && d.slug === draft.slug;
      });
      if (dupe) {
        setError(`"${draft.name}" is already in the integration list. Edit it from Settings instead.`);
        return;
      }
      await integrationStore.create(draft);
      window.location.reload();
    } catch (e) {
      setError(e?.message || "Failed to add discovered integration");
    }
  }

  async function handlePurge() {
    if (!window.confirm("Clear the entire schema cache? Fetched specs will be re-downloaded on next use.")) return;
    try {
      await schemaCache.purge();
      await refresh();
    } catch (e) {
      setError(e?.message || "Failed to purge cache");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />Back
          </Link>
          <Button onClick={refresh} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <h1 className="text-2xl font-bold mb-1 text-slate-900 dark:text-slate-50">Discovery</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Run discovery against a URL or provider slug. Every discovered version URL is persisted; every fetched spec is cached.
        </p>

        {error ? (
          <div className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold mb-3 text-slate-900 dark:text-slate-50">Run discovery</h2>
          <DiscoveryPanel onAddComparisons={handleAddDiscovered} />
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Tracked schema URLs <span className="text-slate-500 font-normal">({urls.length})</span>
            </h2>
          </div>
          {urls.length === 0 ? (
            <p className="text-sm text-slate-500">No URLs tracked yet — run a discovery above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 pr-3 font-medium">Label</th>
                    <th className="py-2 pr-3 font-medium">URL</th>
                    <th className="py-2 pr-3 font-medium whitespace-nowrap">Added</th>
                    <th className="py-2 pr-3 font-medium whitespace-nowrap">Last fetched</th>
                    <th className="py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {urls.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100 dark:border-slate-900 last:border-0">
                      <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{u.label || "—"}</td>
                      <td className="py-2 pr-3 max-w-md">
                        <a
                          href={u.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-blue-600 hover:underline break-all"
                        >
                          {u.url}
                        </a>
                      </td>
                      <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{formatDate(u.addedAt)}</td>
                      <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{formatDate(u.lastFetchedAt)}</td>
                      <td className="py-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemove(u.id)}
                          aria-label={`Remove ${u.url}`}
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Schema cache</h2>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {cacheStats.count} {cacheStats.count === 1 ? "entry" : "entries"} · {formatBytes(cacheStats.totalBytes)}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handlePurge} disabled={cacheStats.count === 0}>
              Purge
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
