import React from "react";

const typeConfig = {
  removed:       { label: "Removed",     pill: "bg-red-100 text-red-700 border border-red-200",       border: "border-l-red-400" },
  renamed:       { label: "Renamed",     pill: "bg-purple-100 text-purple-700 border border-purple-200", border: "border-l-purple-400" },
  moved:         { label: "Moved",       pill: "bg-blue-100 text-blue-700 border border-blue-200",     border: "border-l-blue-400" },
  "type-change": { label: "Type Change", pill: "bg-amber-100 text-amber-700 border border-amber-200",  border: "border-l-amber-400" },
  added:         { label: "Added",       pill: "bg-green-100 text-green-700 border border-green-200",  border: "border-l-green-400" },
  changed:       { label: "Changed",     pill: "bg-amber-100 text-amber-700 border border-amber-200",  border: "border-l-amber-400" },
  unchanged:     { label: "Unchanged",   pill: "bg-stone-100 text-stone-500 border border-stone-200",  border: "border-l-stone-300" },
};

function formatValue(val) {
  if (val === undefined || val === null) return "null";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function pathSegments(fullPath) {
  if (!fullPath) return [];
  return fullPath.split(".");
}

function splitCommonPrefix(oldPath, newPath) {
  const oldSegs = pathSegments(oldPath);
  const newSegs = pathSegments(newPath);
  let i = 0;
  while (i < oldSegs.length && i < newSegs.length && oldSegs[i] === newSegs[i]) i++;
  return { common: oldSegs.slice(0, i), oldTail: oldSegs.slice(i), newTail: newSegs.slice(i) };
}

/** Renders a path as breadcrumb-style segments */
function PathBreadcrumb({ segs, highlightFrom = segs.length - 1, side, onPathClick }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-0.5 font-mono text-xs leading-relaxed">
      {segs.map((seg, i) => {
        const partialPath = segs.slice(0, i + 1).join(".");
        const isDiff = i >= highlightFrom;
        return (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-stone-300 select-none">/</span>}
            <span
              onClick={() => onPathClick && onPathClick(partialPath, side)}
              className={`cursor-pointer px-0.5 rounded transition-colors ${
                isDiff
                  ? "font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200"
                  : "text-stone-400 hover:text-stone-600"
              }`}
              title={partialPath}
            >
              {seg}
            </span>
          </React.Fragment>
        );
      })}
    </span>
  );
}

export default function DiffItem({ result, onPathClick }) {
  const config = typeConfig[result.type] || typeConfig.changed;
  const isRenamed = (result.type === "renamed" || result.type === "moved") && result.newPath;
  const split = isRenamed ? splitCommonPrefix(result.path, result.newPath) : null;

  const confidence = result.confidence;
  const confidenceLabel = confidence != null ? `${Math.round(confidence * 100)}%` : null;
  const confidenceColor = confidence == null ? "" :
    confidence >= 0.85 ? "text-green-600" :
    confidence >= 0.6  ? "text-amber-500" : "text-red-500";

  const side = result.type === "added" ? "right"
    : result.type === "removed" ? "left"
    : "both";

  return (
    <tr className={`border-b border-stone-100 hover:bg-stone-50/80 transition-colors border-l-2 ${config.border}`}>

      {/* Path column */}
      <td className="px-4 py-3">
        {isRenamed ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-red-50 text-red-500 border border-red-200">OLD</span>
              <PathBreadcrumb
                segs={pathSegments(result.path)}
                highlightFrom={split.common.length}
                side="left"
                onPathClick={onPathClick}
              />
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-green-50 text-green-600 border border-green-200">NEW</span>
              <PathBreadcrumb
                segs={pathSegments(result.newPath)}
                highlightFrom={split.common.length}
                side="right"
                onPathClick={onPathClick}
              />
            </div>
          </div>
        ) : (
          <PathBreadcrumb
            segs={pathSegments(result.path)}
            highlightFrom={pathSegments(result.path).length - 1}
            side={side}
            onPathClick={onPathClick}
          />
        )}
      </td>

      {/* Badge column */}
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="flex flex-col items-start gap-1">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${config.pill}`}>
            {config.label}
          </span>
          {confidenceLabel && (
            <span className={`text-[10px] font-medium pl-1 ${confidenceColor}`}>
              {confidenceLabel} match
            </span>
          )}
        </div>
      </td>

      {/* Diff column */}
      <td className="px-3 py-3 font-mono text-xs">
        {result.type === "type-change" && result.oldType && result.newType ? (
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 line-through">{result.oldType}</span>
            <span className="text-stone-400">→</span>
            <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200">{result.newType}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {result.old !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 line-through w-fit max-w-[200px] truncate" title={formatValue(result.old)}>
                {formatValue(result.old)}
              </span>
            )}
            {result.new !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200 w-fit max-w-[200px] truncate" title={formatValue(result.new)}>
                {formatValue(result.new)}
              </span>
            )}
            {result.old === undefined && result.new === undefined && (
              <span className="text-stone-300">—</span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}