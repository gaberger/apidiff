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

// Severity → visual treatment. Mirrors api-changeset-schema.json's
// breaking/notice/info severities.
const SEVERITY_STYLES = {
  breaking: { pillBg: "bg-red-600", pillText: "text-white", rowBg: "bg-red-50", rowBorder: "border-red-200", label: "Breaking" },
  notice:   { pillBg: "bg-amber-500", pillText: "text-white", rowBg: "bg-amber-50", rowBorder: "border-amber-200", label: "Notice" },
  info:     { pillBg: "bg-blue-500", pillText: "text-white", rowBg: "bg-blue-50", rowBorder: "border-blue-200", label: "Info" },
};

function ChangesetView({ changeset }) {
  const changes = changeset.changes || [];
  // Group by severity: breaking first, then notice, then info.
  const bySeverity = { breaking: [], notice: [], info: [] };
  for (const c of changes) (bySeverity[c.severity] || bySeverity.info).push(c);

  const groupOrder = ["breaking", "notice", "info"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Changeset v{changeset.changeset_version || "0.2"}
          {changeset.api && (
            <span className="ml-2 text-muted-foreground font-normal">
              {changeset.api.name} {changeset.api.from?.version} → {changeset.api.to?.version}
            </span>
          )}
        </h3>
        <span className="text-xs text-muted-foreground">{changes.length} change{changes.length === 1 ? "" : "s"}</span>
      </div>

      {groupOrder.map((sev) => {
        const list = bySeverity[sev];
        if (!list?.length) return null;
        const style = SEVERITY_STYLES[sev];
        return (
          <div key={sev}>
            <h4 className={`inline-flex items-center gap-2 px-2 py-0.5 text-xs font-semibold rounded-md ${style.pillBg} ${style.pillText} mb-2`}>
              {style.label}
              <span className="text-[10px] opacity-80">{list.length}</span>
            </h4>
            <ul className="space-y-2">
              {list.map((c) => (
                <li key={c.id} className={`p-3 rounded border ${style.rowBorder} ${style.rowBg}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-background/70 text-foreground border border-border">{c.op}</code>
                        <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-background/70 text-muted-foreground border border-border">{c.target}</code>
                        <span className="text-[11px] font-mono text-muted-foreground">{c.id}</span>
                      </div>
                      <div className="text-sm text-foreground">{c.description}</div>
                      {c.rationale && (
                        <div className="text-xs text-muted-foreground mt-1 italic">{c.rationale}</div>
                      )}
                      {c.migration?.client_action && (
                        <div className="mt-2 p-2 rounded bg-background/60 border border-border/70">
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Client action</div>
                          <div className="text-xs text-foreground">{c.migration.client_action}</div>
                        </div>
                      )}
                      {Array.isArray(c.humanReadable) && c.humanReadable.length > 0 && (
                        <div className="mt-2">
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Affected</div>
                          <ul className="space-y-0.5">
                            {c.humanReadable.map((h, i) => (
                              <li key={i}><code className="text-[11px] font-mono text-foreground">{h}</code></li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    {(c.at || c.from || c.to) && (
                      <div className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                        {Array.isArray(c.at) ? c.at[0] : (c.at || (Array.isArray(c.to) ? c.to[0] : c.to) || (Array.isArray(c.from) ? c.from[0] : c.from))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export default function DiffResults({ results, summaryCounts, activeFilter, onFilterChange, onPathClick }) {
  // Handle release notes display (both pure release notes and spec diff with release notes)
  const isReleaseNotes = results?.[0]?.type === "releaseNotes" || results?.[0]?.type === "specDiff";
  
  if (isReleaseNotes) {
    const releaseData = results[0];
    const changeset = releaseData.changeset;
    const hasChangeset = changeset && Array.isArray(changeset.changes) && changeset.changes.length > 0;
    return (
      <div className="border border-border rounded-lg overflow-hidden bg-white p-6">
        <h2 className="text-lg font-bold text-foreground mb-4">{releaseData.label}</h2>

        {releaseData.stats && (
          <div className="flex flex-wrap gap-4 mb-6">
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

        {hasChangeset && (
          <ChangesetView changeset={changeset} />
        )}
        {hasChangeset && (
          <hr className="my-6 border-border" />
        )}
        
        {releaseData.diff && (
          <div className="space-y-6">
            {releaseData.diff.breakingChanges?.added?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-red-600 mb-2">Breaking Changes</h3>
                <ul className="space-y-2">
                  {releaseData.diff.breakingChanges.added.map((item, i) => (
                    <li key={i} className="p-3 rounded bg-red-50 border border-red-100">
                      <div className="font-medium text-sm text-foreground">{item.title}</div>
                      <p className="text-xs text-foreground/80 mt-1">{item.description}</p>
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
                      <div className="font-medium text-sm text-foreground">{item.title}</div>
                      <p className="text-xs text-foreground/80 mt-1">{item.description}</p>
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
                      <div className="font-medium text-sm text-foreground">{item.title}</div>
                      <p className="text-xs text-foreground/80 mt-1">{item.description}</p>
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
                      <div className="font-medium text-sm text-foreground">{item.title}</div>
                      <p className="text-xs text-foreground/80 mt-1">{item.description}</p>
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
                      <div className="font-medium text-sm text-foreground">{item.title}</div>
                      <p className="text-xs text-foreground/80 mt-1">{item.description}</p>
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
              <p className="text-sm text-muted-foreground italic">No changes recorded for this release.</p>
            )}
          </div>
        )}
        
        {!releaseData.diff && (
          <p className="text-sm text-muted-foreground italic">No detailed diff available for this release.</p>
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
        <div className="text-center py-16 text-muted-foreground/70 text-sm">
          No {activeFilter === "all" ? "" : activeFilter + " "}changes found
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden bg-white">
          <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
            <table className="w-full text-left table-fixed min-w-[500px]">
              <colgroup>
                <col className="w-[50%]" />
                <col className="w-[100px]" />
                <col />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-secondary border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Path
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Change
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
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
            <div className="border-t border-border px-4 py-3 text-center bg-muted/40">
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
