import { useMemo } from "react";

function pickReleaseDate(v) {
  if (v.released_at) return v.released_at;
  if (v.date) return v.date;
  const m = /(\d{4}[-/]\d{2}[-/]\d{2})/.exec(v.label || "");
  return m ? m[1].replace(/\//g, "-") : null;
}

function formatDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function VersionTimeline({
  versions,
  selectedV1Idx,
  selectedV2Idx,
  onSelect,
  accentColor = "hsl(var(--primary))",
}) {
  const items = useMemo(() => {
    return versions.map((v) => ({
      idx: v.__idx,
      label: v.label,
      url: v.url,
      date: pickReleaseDate(v),
    }));
  }, [versions]);

  function handleClick(idx) {
    if (selectedV1Idx === idx || selectedV2Idx === idx) {
      onSelect({ v1Idx: null, v2Idx: null });
      return;
    }
    if (selectedV1Idx === null) {
      onSelect({ v1Idx: idx, v2Idx: selectedV2Idx });
      return;
    }
    if (selectedV2Idx === null) {
      const next = idx > selectedV1Idx
        ? { v1Idx: selectedV1Idx, v2Idx: idx }
        : { v1Idx: idx, v2Idx: selectedV1Idx };
      onSelect(next);
      return;
    }
    onSelect({ v1Idx: idx, v2Idx: null });
  }

  if (items.length === 0) return null;

  const rangeStart = selectedV1Idx !== null ? Math.min(selectedV1Idx, selectedV2Idx ?? selectedV1Idx) : null;
  const rangeEnd = selectedV2Idx !== null ? Math.max(selectedV1Idx, selectedV2Idx) : null;

  return (
    <div className="relative w-full">
      <div className="relative overflow-x-auto pb-2">
        <div className="relative flex items-start gap-0 pt-4 px-2 min-w-max">
          <div className="absolute left-2 right-2 top-[1.375rem] h-px bg-border" />
          {rangeStart !== null && rangeEnd !== null && rangeEnd > rangeStart && (
            <div
              className="absolute top-[1.375rem] h-px transition-all duration-base ease-standard"
              style={{
                left: `calc(${(rangeStart / Math.max(items.length - 1, 1)) * 100}% + 0.5rem)`,
                right: `calc(${((items.length - 1 - rangeEnd) / Math.max(items.length - 1, 1)) * 100}% + 0.5rem)`,
                background: accentColor,
              }}
            />
          )}
          {items.map((v, i) => {
            const isV1 = v.idx === selectedV1Idx;
            const isV2 = v.idx === selectedV2Idx;
            const selected = isV1 || isV2;
            const inRange = rangeStart !== null && rangeEnd !== null && v.idx > rangeStart && v.idx < rangeEnd;
            const role = isV1 ? "From" : isV2 ? "To" : null;
            return (
              <button
                key={v.url ?? v.label ?? i}
                type="button"
                onClick={() => handleClick(v.idx)}
                className="group relative flex flex-col items-center px-2 py-1 outline-none"
                title={`${v.label}${v.date ? ` \u00b7 ${formatDate(v.date)}` : ""}`}
              >
                <span
                  className={`relative z-10 block h-3 w-3 rounded-full border-2 transition-all duration-fast ease-standard ${
                    selected
                      ? "bg-background shadow-e2 scale-110"
                      : inRange
                      ? "bg-background"
                      : "bg-background group-hover:scale-110 group-hover:shadow-e1"
                  }`}
                  style={{
                    borderColor: selected || inRange ? accentColor : "hsl(var(--border))",
                  }}
                />
                <span
                  className={`mt-1.5 text-[10px] font-mono whitespace-nowrap transition-colors duration-fast ease-standard ${
                    selected ? "text-foreground font-semibold" : "text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  {v.label}
                </span>
                {v.date && (
                  <span className="text-[9px] text-muted-foreground/70 whitespace-nowrap mt-0.5">
                    {formatDate(v.date)}
                  </span>
                )}
                {role && (
                  <span
                    className="mt-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm text-white"
                    style={{ background: accentColor }}
                  >
                    {role}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {selectedV1Idx === null && "Click a version to set the From point"}
          {selectedV1Idx !== null && selectedV2Idx === null && "Click another version to set the To point"}
          {selectedV1Idx !== null && selectedV2Idx !== null && `Comparing ${items.find((x) => x.idx === selectedV1Idx)?.label ?? ""} to ${items.find((x) => x.idx === selectedV2Idx)?.label ?? ""}`}
        </span>
        <span className="t-meta">{items.length} versions</span>
      </div>
    </div>
  );
}
