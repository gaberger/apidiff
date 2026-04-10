import { useState } from "react";
import { ArrowRight, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function IntegrationHeader({ integration, onLoadSpecs, onClear }) {
  const [v1Idx, setV1Idx] = useState(null);
  const [v2Idx, setV2Idx] = useState(null);
  const [loading, setLoading] = useState(false);

  const versions = integration.versions || [];
  const color = integration.color || "#666";

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
      onLoadSpecs(r1, r2, `${integration.name}: ${v1.label} → ${v2.label}`);
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
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={v1Idx ?? ""}
            onChange={(e) => setV1Idx(e.target.value === "" ? null : Number(e.target.value))}
            className="flex-1 min-w-[120px] text-xs px-2.5 py-1.5 rounded-md border border-stone-200 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-300"
          >
            <option value="">Select old version…</option>
            {versions.map((v, i) => (
              <option key={i} value={i} disabled={i === v2Idx}>{v.label}</option>
            ))}
          </select>

          <ArrowRight className="w-4 h-4 text-stone-300 flex-shrink-0" />

          <select
            value={v2Idx ?? ""}
            onChange={(e) => setV2Idx(e.target.value === "" ? null : Number(e.target.value))}
            className="flex-1 min-w-[120px] text-xs px-2.5 py-1.5 rounded-md border border-stone-200 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-300"
          >
            <option value="">Select new version…</option>
            {versions.map((v, i) => (
              <option key={i} value={i} disabled={i === v1Idx}>{v.label}</option>
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
      ) : (
        <p className="text-xs text-stone-400 italic">
          No versions discovered yet. Use Settings to run discovery or paste specs manually below.
        </p>
      )}
    </div>
  );
}