import React, { useRef, useEffect, useMemo } from "react";
import { useDiffHighlight } from "../../hooks/use-diff-highlight.js";

const lineBgByType = {
  removed:       "bg-red-50",
  added:         "bg-green-50",
  renamed:       "bg-purple-50",
  moved:         "bg-blue-50",
  "type-change": "bg-amber-50",
  changed:       "bg-amber-50",
};

/**
 * Renders colored line backgrounds over a textarea to show diff highlights.
 *
 * @param {{ jsonString: string, results: Array, scrollTop: number }} props
 */
export function EditorOverlay({ jsonString, results, scrollTop }) {
  const containerRef = useRef(null);
  const highlights = useDiffHighlight(jsonString, results);

  // Sync scroll position with the paired textarea
  useEffect(() => {
    if (containerRef.current != null && scrollTop != null) {
      containerRef.current.scrollTop = scrollTop;
    }
  }, [scrollTop]);

  const lines = useMemo(() => {
    if (!jsonString) return [];
    return jsonString.split("\n");
  }, [jsonString]);

  if (!jsonString) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    >
      <div
        className="font-mono text-[13px] leading-[1.6]"
        style={{
          padding: "14px 14px 14px 52px",
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
          transform: `translateY(-${scrollTop || 0}px)`,
        }}
      >
        {lines.map((line, i) => {
          const info = highlights.get(i);
          const bgClass = info ? lineBgByType[info.type] || "" : "";

          return (
            <div key={i} className={`${bgClass} min-h-[1.6em]`}>
              <span
                className="inline-block w-8 -ml-[38px] mr-[6px] text-right text-stone-400 opacity-50 text-[11px] select-none pointer-events-none"
              >
                {i + 1}
              </span>
              {line || "\u00A0"}
            </div>
          );
        })}
      </div>
    </div>
  );
}
