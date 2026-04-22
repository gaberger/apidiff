import React, { useState, useMemo, useRef, useEffect } from "react";
import DiffSummary from "@/components/diff/DiffSummary";
import DiffItem from "@/components/diff/DiffItem";

const BREAKING_TYPES = ["removed", "type-change", "renamed", "moved"];

function filterResults(results, filter) {
  const nonUnchanged = results.filter((r) => r.type !== "unchanged");
  if (filter === "all") return nonUnchanged;
  if (filter === "breaking") return nonUnchanged.filter((r) => BREAKING_TYPES.includes(r.type));
  return nonUnchanged.filter((r) => r.type === filter);
}

export default function DiffResults({ results, summaryCounts, activeFilter, onFilterChange, onPathClick }) {
  // Handle release notes display (both pure release notes and spec diff with release notes)
  const isReleaseNotes = results?.[0]?.type === "releaseNotes" || results?.[0]?.type === "specDiff";
  
  if (isReleaseNotes) {
    const releaseData = results[0];
    return (
      <div className="border border-stone-200 rounded-lg overflow-hidden bg-white p-6">
        <h2 className="text-lg font-bold text-stone-800 mb-4">{releaseData.label}</h2>
        
        {releaseData.stats && (
          <div className="flex gap-4 mb-6">
            <div className="px-4 py-2 rounded-lg bg-red-50 border border-red-200">
              <div className="text-2xl font-bold text-red-600">{releaseData.stats.breaking || 0}</div>
              <div className="text-xs text-red-500">Breaking Changes</div>
            </div>
            <div className="px-4 py-2 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-2xl font-bold text-blue-600">{releaseData.stats.newOperations || 0}</div>
              <div className="text-xs text-blue-500">New Operations</div>
            </div>
            <div className="px-4 py-2 rounded-lg bg-green-50 border border-green-200">
              <div className="text-2xl font-bold text-green-600">{releaseData.stats.newModels || 0}</div>
              <div className="text-xs text-green-500">New Models</div>
            </div>
            <div className="px-4 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-2xl font-bold text-amber-600">{releaseData.stats.modelChanges || 0}</div>
              <div className="text-xs text-amber-500">Model Changes</div>
            </div>
          </div>
        )}
        
        {releaseData.diff && (
          <div className="space-y-6">
            {releaseData.diff.breakingChanges?.added?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-red-600 mb-2">Breaking Changes</h3>
                <ul className="space-y-2">
                  {releaseData.diff.breakingChanges.added.map((item, i) => (
                    <li key={i} className="p-3 rounded bg-red-50 border border-red-100">
                      <div className="font-medium text-sm text-stone-800">{item.title}</div>
                      <p className="text-xs text-stone-600 mt-1">{item.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {releaseData.diff.scheduledBreakingChanges?.added?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-amber-600 mb-2">Scheduled Breaking Changes</h3>
                <ul className="space-y-2">
                  {releaseData.diff.scheduledBreakingChanges.added.map((item, i) => (
                    <li key={i} className="p-3 rounded bg-amber-50 border border-amber-100">
                      <div className="font-medium text-sm text-stone-800">{item.title}</div>
                      <p className="text-xs text-stone-600 mt-1">{item.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {releaseData.diff.newOperations?.added?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-blue-600 mb-2">New Operations</h3>
                <ul className="space-y-2">
                  {releaseData.diff.newOperations.added.map((item, i) => (
                    <li key={i} className="p-3 rounded bg-blue-50 border border-blue-100">
                      <div className="font-medium text-sm text-stone-800">{item.title}</div>
                      <p className="text-xs text-stone-600 mt-1">{item.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {releaseData.diff.newModels?.added?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-green-600 mb-2">New Models</h3>
                <ul className="space-y-2">
                  {releaseData.diff.newModels.added.map((item, i) => (
                    <li key={i} className="p-3 rounded bg-green-50 border border-green-100">
                      <div className="font-medium text-sm text-stone-800">{item.title}</div>
                      <p className="text-xs text-stone-600 mt-1">{item.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {releaseData.diff.modelChanges?.added?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-amber-600 mb-2">Model Changes</h3>
                <ul className="space-y-2">
                  {releaseData.diff.modelChanges.added.map((item, i) => (
                    <li key={i} className="p-3 rounded bg-amber-50 border border-amber-100">
                      <div className="font-medium text-sm text-stone-800">{item.title}</div>
                      <p className="text-xs text-stone-600 mt-1">{item.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {(!releaseData.diff.breakingChanges?.added?.length && 
             !releaseData.diff.scheduledBreakingChanges?.added?.length && 
             !releaseData.diff.newOperations?.added?.length &&
             !releaseData.diff.newModels?.added?.length &&
             !releaseData.diff.modelChanges?.added?.length) && (
              <p className="text-sm text-stone-500 italic">No changes recorded for this release.</p>
            )}
          </div>
        )}
        
        {!releaseData.diff && (
          <p className="text-sm text-stone-500 italic">No detailed diff available for this release.</p>
        )}
      </div>
    );
  }

  const [visibleCount, setVisibleCount] = useState(20);

  // Results are already filtered by path and type in DiffViewer
  // Just apply pagination here
  const filtered = results || [];
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const handleFilterChange = (f) => {
    onFilterChange?.(f);
    setVisibleCount(20);
  };

  return (
    <div className="space-y-4">
      <DiffSummary
        results={results}
        summaryCounts={summaryCounts}
        activeFilter={activeFilter}
        onFilterChange={handleFilterChange}
      />

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-400 text-sm">
          No {activeFilter === "all" ? "" : activeFilter + " "}changes found
        </div>
      ) : (
        <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
          <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
            <table className="w-full text-left table-fixed min-w-[500px]">
              <colgroup>
                <col className="w-[50%]" />
                <col className="w-[100px]" />
                <col />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-stone-100 border-b border-stone-200">
                <tr>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                    Path
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                    Change
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                    Diff
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((result) => (
                  <DiffItem
                    key={result.path}
                    result={result}
                    onPathClick={onPathClick}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="border-t border-stone-200 px-4 py-3 text-center bg-stone-50">
              <button
                onClick={() => setVisibleCount((c) => c + 50)}
                className="text-xs font-medium text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
              >
                Show more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
