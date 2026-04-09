import React, { useState, useMemo } from "react";
import DiffSummary from "@/components/diff/DiffSummary";
import DiffItem from "@/components/diff/DiffItem";

const BREAKING_TYPES = ["removed", "type-change", "renamed", "moved"];
const PAGE_SIZE = 50;

function filterResults(results, filter) {
  const nonUnchanged = results.filter((r) => r.type !== "unchanged");
  if (filter === "all") return nonUnchanged;
  if (filter === "breaking") return nonUnchanged.filter((r) => BREAKING_TYPES.includes(r.type));
  return nonUnchanged.filter((r) => r.type === filter);
}

export default function DiffResults({ results, activeFilter, onFilterChange, onPathClick }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(
    () => filterResults(results, activeFilter),
    [results, activeFilter]
  );

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <DiffSummary
        results={results}
        activeFilter={activeFilter}
        onFilterChange={(f) => {
          onFilterChange(f);
          setVisibleCount(PAGE_SIZE);
        }}
      />

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-400 text-sm">
          No {activeFilter === "all" ? "" : activeFilter + " "}changes found
        </div>
      ) : (
        <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-left table-fixed">
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
              {visible.map((result, i) => (
                <DiffItem
                  key={`${result.type}-${result.path}-${i}`}
                  result={result}
                  onPathClick={onPathClick}
                />
              ))}
            </tbody>
          </table>

          {hasMore && (
            <div className="border-t border-stone-200 px-4 py-3 text-center bg-stone-50">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
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
