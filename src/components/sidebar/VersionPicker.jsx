import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function VersionPicker({ provider, onSelectComparison }) {
  const [v1Idx, setV1Idx] = useState(null);
  const [v2Idx, setV2Idx] = useState(null);
  const [loading, setLoading] = useState(false);

  const versions = provider.versions || [];

  async function handleCompare() {
    if (v1Idx === null || v2Idx === null || v1Idx === v2Idx) return;
    const v1 = versions[v1Idx];
    const v2 = versions[v2Idx];
    const label = `${provider.name}: ${v1.label} → ${v2.label}`;

    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        base44.functions.invoke('proxyFetch', { url: v1.url }).then(r => r.data.document),
        base44.functions.invoke('proxyFetch', { url: v2.url }).then(r => r.data.document),
      ]);
      onSelectComparison(r1, r2, label);
    } finally {
      setLoading(false);
    }
  }

  if (versions.length === 0) return null;

  return (
    <div className="px-3 pl-6 py-2 space-y-1.5">
      <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
        Pick two versions
      </div>
      <div className="flex gap-1.5 items-center">
        <select
          value={v1Idx ?? ""}
          onChange={(e) => setV1Idx(e.target.value === "" ? null : Number(e.target.value))}
          className="flex-1 text-[11px] px-1.5 py-1 rounded border border-stone-200 bg-white text-stone-700 focus:outline-none focus:border-stone-400 truncate"
        >
          <option value="">Old…</option>
          {versions.map((v, i) => (
            <option key={i} value={i} disabled={i === v2Idx}>
              {v.label}
            </option>
          ))}
        </select>
        <ArrowRight className="w-3 h-3 text-stone-400 flex-shrink-0" />
        <select
          value={v2Idx ?? ""}
          onChange={(e) => setV2Idx(e.target.value === "" ? null : Number(e.target.value))}
          className="flex-1 text-[11px] px-1.5 py-1 rounded border border-stone-200 bg-white text-stone-700 focus:outline-none focus:border-stone-400 truncate"
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
        className="w-full text-[11px] font-medium py-1 rounded bg-stone-800 text-white hover:bg-stone-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
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