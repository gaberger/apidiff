import React from "react";

const typeConfig = {
  removed:       { label: "Removed",     bg: "bg-red-100",    text: "text-red-600" },
  renamed:       { label: "Renamed",     bg: "bg-purple-100", text: "text-purple-600" },
  moved:         { label: "Moved",       bg: "bg-blue-100",   text: "text-blue-600" },
  "type-change": { label: "Type Change", bg: "bg-amber-100",  text: "text-amber-600" },
  added:         { label: "Added",       bg: "bg-green-100",  text: "text-green-600" },
  changed:       { label: "Changed",     bg: "bg-amber-100",  text: "text-amber-600" },
  unchanged:     { label: "Unchanged",   bg: "bg-stone-100",  text: "text-stone-500" },
};

function formatValue(val) {
  if (val === undefined || val === null) return "null";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

/** Split a dot-path into individually clickable segments */
function pathSegments(fullPath) {
  if (!fullPath) return [];
  return fullPath.split(".");
}

/**
 * For renamed/moved paths, find the common prefix and divergent suffixes.
 * e.g., "a.b.c.old.x" vs "a.b.c.new.x" → { common: ["a","b","c"], oldTail: ["old","x"], newTail: ["new","x"] }
 */
function splitCommonPrefix(oldPath, newPath) {
  const oldSegs = pathSegments(oldPath);
  const newSegs = pathSegments(newPath);
  let i = 0;
  while (i < oldSegs.length && i < newSegs.length && oldSegs[i] === newSegs[i]) i++;
  return {
    common: oldSegs.slice(0, i),
    oldTail: oldSegs.slice(i),
    newTail: newSegs.slice(i),
  };
}

export default function DiffItem({ result, onPathClick }) {
  const config = typeConfig[result.type] || typeConfig.changed;
  const isRenamed = (result.type === "renamed" || result.type === "moved") && result.newPath;
  const split = isRenamed ? splitCommonPrefix(result.path, result.newPath) : null;

  // Render a segment list with clickability — each segment scrolls to its partial path
  const renderSegs = (segs, fullPath, side, hoverColor, highlightFrom) => (
    segs.map((seg, i) => {
      const partialPath = segs.slice(0, i + 1).join(".");
      const isDiff = i >= highlightFrom;
      return (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-stone-300">.</span>}
          <span
            onClick={() => onPathClick && onPathClick(partialPath, side)}
            className={`cursor-pointer rounded px-0.5 transition-colors ${hoverColor} ${
              isDiff ? "font-bold text-stone-800 underline decoration-2 decoration-amber-400" : "text-stone-400"
            }`}
            title={partialPath}
          >
            {seg}
          </span>
        </React.Fragment>
      );
    })
  );

  return (
    <tr className="border-b border-stone-200 hover:bg-stone-100/50 transition-colors">
      {/* Path column */}
      <td className="px-4 py-2.5 font-mono text-xs">
        <div className="break-all leading-relaxed">
          {isRenamed ? (
            <div className="flex flex-col gap-0.5">
              {/* Old path — divergent segments underlined red */}
              <div>
                <span className="text-red-400 text-[10px] font-semibold mr-1">OLD</span>
                {renderSegs(pathSegments(result.path), result.path, "left", "hover:bg-red-100 hover:text-red-800", split.common.length)}
              </div>
              {/* New path — divergent segments underlined green */}
              <div>
                <span className="text-green-500 text-[10px] font-semibold mr-1">NEW</span>
                {renderSegs(pathSegments(result.newPath), result.newPath, "right", "hover:bg-green-100 hover:text-green-800", split.common.length)}
              </div>
            </div>
          ) : (
            <>
              {pathSegments(result.path).map((seg, i, arr) => {
                const isLast = i === arr.length - 1;
                const partialPath = arr.slice(0, i + 1).join(".");
                const side = result.type === "added" ? "right"
                  : result.type === "removed" ? "left"
                  : "both";
                const hoverColor = side === "right" ? "hover:bg-green-100 hover:text-green-800"
                  : side === "left" ? "hover:bg-amber-100 hover:text-amber-800"
                  : "hover:bg-blue-100 hover:text-blue-800";
                return (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-stone-300">.</span>}
                    <span
                      onClick={() => onPathClick && onPathClick(partialPath, side)}
                      className={`cursor-pointer rounded px-0.5 transition-colors ${hoverColor} ${
                        isLast ? "font-bold text-stone-800" : "text-stone-400"
                      }`}
                      title={partialPath}
                    >
                      {seg}
                    </span>
                  </React.Fragment>
                );
              })}
            </>
          )}
        </div>
      </td>

      {/* Change type badge column */}
      <td className="px-4 py-2.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${config.bg} ${config.text}`}
        >
          {config.label}
        </span>
        {result.confidence != null && (
          <span
            className={`ml-1 text-[10px] font-medium ${
              result.confidence >= 0.85 ? "text-green-600" :
              result.confidence >= 0.6 ? "text-amber-600" :
              "text-red-500"
            }`}
            title={`Match confidence: ${Math.round(result.confidence * 100)}%`}
          >
            {result.confidence >= 0.85 ? "●" : result.confidence >= 0.6 ? "◐" : "○"}
            {" "}{Math.round(result.confidence * 100)}%
          </span>
        )}
      </td>

      {/* Diff column */}
      <td className="px-4 py-2.5 font-mono text-xs">
        {result.type === "type-change" && result.oldType && result.newType ? (
          <span>
            <span className="text-red-600 line-through">{result.oldType}</span>
            <span className="text-stone-400 mx-1">{"\u2192"}</span>
            <span className="text-green-600">{result.newType}</span>
          </span>
        ) : (
          <span>
            {result.old !== undefined && (
              <span className="text-red-600 line-through mr-2">
                {formatValue(result.old)}
              </span>
            )}
            {result.new !== undefined && (
              <span className="text-green-600">
                {formatValue(result.new)}
              </span>
            )}
            {result.old === undefined && result.new === undefined && (
              <span className="text-stone-400">&mdash;</span>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}
