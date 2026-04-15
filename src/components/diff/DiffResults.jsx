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

export default function DiffResults({ results, activeFilter, onFilterChange, onPathClick }) {
  const [activeFilter_, setActiveFilter] = useState(activeFilter || "all");
  const [visibleCount, setVisibleCount] = useState(20);

  const filtered = useMemo(
    () => filterResults(results, activeFilter_),
    [results, activeFilter_]
  );

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const handleFilterChange = (f) => {
    setActiveFilter(f);
    onFilterChange?.(f);
    setVisibleCount(20);
  };

  return (
    <div className="space-y-4">
      <DiffSummary
        results={results}
        activeFilter={activeFilter_}
        onFilterChange={handleFilterChange}
      />

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-400 text-sm">
          No {activeFilter_ === "all" ? "" : activeFilter_ + " "}changes found
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
