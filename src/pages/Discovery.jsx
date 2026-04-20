import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { schemaCache, schemaUrlRegistry } from "@/lib/browser-stores";
import { PROVIDER_REGISTRY } from "@/lib/domain/provider-registry.js";
import DiscoveryPanel from "@/components/settings/DiscoveryPanel";
import releaseNotesDiff from "@/data/release-notes-diff.json";

function formatBytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// "v26.3 · Complete" / "26.3.0" / ".../26.3/api/spec/..." → "26.3"
function shortVersion(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+\.\d+)/);
  return m ? m[1] : null;
}

function providerForHost(host) {
  return PROVIDER_REGISTRY.find((p) => {
    if (p.specSource.kind === "docusaurus") return hostnameOf(p.specSource.baseUrl) === host;
    if (p.specSource.kind === "url") return p.specSource.specUrls.some((u) => hostnameOf(u.url) === host);
    return false;
  }) || null;
}

// Forward Networks release-notes data lives in an offline-generated JSON bundle.
// Keyed by short-version ("26.3") → diff bucket. Non-Forward hosts have no data today.
const FWD_DIFFS_BY_VERSION = new Map();
for (const d of releaseNotesDiff.diffs || []) {
  const k = shortVersion(d.to);
  if (k) FWD_DIFFS_BY_VERSION.set(k, d);
}
const FWD_HOST = "docs.fwd.app";

function DiffBadges({ diff }) {
  if (!diff) return <span className="text-xs text-slate-400">no release notes</span>;
  const counts = [
    ["breaking", diff.breakingChanges?.added?.length || 0, "text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900"],
    ["scheduled", diff.scheduledBreakingChanges?.added?.length || 0, "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900"],
    ["new ops", diff.newOperations?.added?.length || 0, "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900"],
    ["new models", diff.newModels?.added?.length || 0, "text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-900"],
    ["model changes", diff.modelChanges?.added?.length || 0, "text-slate-700 bg-slate-50 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"],
  ].filter(([, n]) => n > 0);
  if (counts.length === 0) return <span className="text-xs text-slate-400">no changes</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {counts.map(([label, n, cls]) => (
        <span key={label} className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>
          {n} {label}
        </span>
      ))}
    </div>
  );
}

function DiffBullets({ diff }) {
  if (!diff) return null;
  const sections = [
    ["Breaking", diff.breakingChanges?.added || [], "text-rose-700 dark:text-rose-400"],
    ["Scheduled breaking", diff.scheduledBreakingChanges?.added || [], "text-amber-700 dark:text-amber-400"],
    ["New operations", diff.newOperations?.added || [], "text-emerald-700 dark:text-emerald-400"],
    ["New models", diff.newModels?.added || [], "text-sky-700 dark:text-sky-400"],
    ["Model changes", diff.modelChanges?.added || [], "text-slate-700 dark:text-slate-300"],
  ].filter(([, xs]) => xs.length > 0);
  if (sections.length === 0) return null;
  return (
    <div className="space-y-3 mt-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
      {sections.map(([title, items, color]) => (
        <div key={title}>
          <div className={`text-xs font-semibold mb-1 ${color}`}>{title}</div>
          <ul className="space-y-1">
            {items.slice(0, 10).map((it, i) => (
              <li key={i} className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-mono text-[10px] text-slate-400 mr-1">{it.title}</span>
                {it.description ? it.description : null}
              </li>
            ))}
            {items.length > 10 ? (
              <li className="text-[10px] text-slate-400">…{items.length - 10} more</li>
            ) : null}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SpecRow({ spec, diff, onRemove }) {
  const [open, setOpen] = useState(false);
  const v = shortVersion(spec.label) || shortVersion(spec.url);
  return (
    <div className="border border-slate-100 dark:border-slate-900 rounded p-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setOpen((x) => !x)}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-900 dark:text-slate-50"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {spec.label || v || "(unlabeled)"}
        </button>
        {v ? (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            v{v}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <a
            href={spec.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs inline-flex items-center gap-1 text-blue-600 hover:underline"
          >
            spec <ExternalLink className="w-3 h-3" />
          </a>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRemove(spec.id)}
            aria-label={`Remove ${spec.url}`}
            title="Stop tracking this URL"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="mt-1.5">
        <DiffBadges diff={diff} />
      </div>
      {open ? <DiffBullets diff={diff} /> : null}
    </div>
  );
}

function ProviderGroup({ host, provider, specs, initiallyOpen, onRemove }) {
  const [open, setOpen] = useState(!!initiallyOpen);
  const name = provider?.name || host || "Unknown provider";
  const changelogUrl = provider?.changelogUrl;
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-md mb-3">
      <button
        onClick={() => setOpen((x) => !x)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <span className="font-semibold text-sm text-slate-900 dark:text-slate-50">{name}</span>
        <span className="text-xs text-slate-500">{host}</span>
        <span className="ml-auto text-xs text-slate-500">
          {specs.length} spec{specs.length !== 1 ? "s" : ""}
        </span>
        {changelogUrl ? (
          <a
            href={changelogUrl}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="text-xs inline-flex items-center gap-1 text-blue-600 hover:underline"
          >
            <FileText className="w-3 h-3" /> changelog
          </a>
        ) : null}
      </button>
      {open ? (
        <div className="px-3 pb-3 space-y-2">
          {specs.map((s) => {
            const v = shortVersion(s.label) || shortVersion(s.url);
            const diff = host === FWD_HOST && v ? FWD_DIFFS_BY_VERSION.get(v) : null;
            return <SpecRow key={s.id} spec={s} diff={diff} onRemove={onRemove} />;
          })}
        </div>
      ) : null}
    </div>
  );
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

  const groups = useMemo(() => {
    const byHost = new Map();
    for (const u of urls) {
      const host = hostnameOf(u.url);
      if (!byHost.has(host)) byHost.set(host, []);
      byHost.get(host).push(u);
    }
    for (const specs of byHost.values()) {
      specs.sort((a, b) => {
        const av = shortVersion(a.label) || shortVersion(a.url) || "";
        const bv = shortVersion(b.label) || shortVersion(b.url) || "";
        return bv.localeCompare(av, undefined, { numeric: true });
      });
    }
    return Array.from(byHost.entries())
      .map(([host, specs]) => ({ host, provider: providerForHost(host), specs }))
      .sort((a, b) => {
        const an = (a.provider?.name || a.host).toLowerCase();
        const bn = (b.provider?.name || b.host).toLowerCase();
        return an.localeCompare(bn);
      });
  }, [urls]);

  async function handleRemove(id) {
    try {
      await schemaUrlRegistry.remove(id);
      await refresh();
    } catch (e) {
      setError(e?.message || "Failed to remove URL");
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
          Every discovered spec, its version, and any release notes we have for it.
          Comparison pairs are created from the Integrations page.
        </p>

        {error ? (
          <div className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold mb-3 text-slate-900 dark:text-slate-50">Run discovery</h2>
          <DiscoveryPanel onAddComparisons={() => { /* /discovery is a spec catalog — comparison-building lives in /settings */ }} />
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Specs{" "}
              <span className="text-slate-500 font-normal">
                ({groups.length} provider{groups.length !== 1 ? "s" : ""} · {urls.length} spec{urls.length !== 1 ? "s" : ""})
              </span>
            </h2>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-slate-500">No specs tracked yet — run a discovery above.</p>
          ) : (
            groups.map((g) => (
              <ProviderGroup
                key={g.host}
                host={g.host}
                provider={g.provider}
                specs={g.specs}
                initiallyOpen={groups.length === 1}
                onRemove={handleRemove}
              />
            ))
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
