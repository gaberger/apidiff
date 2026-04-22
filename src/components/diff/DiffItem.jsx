import React from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const typeConfig = {
  removed:       { label: "Removed",     pill: "bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800",             border: "border-l-red-400 dark:border-l-red-500" },
  renamed:       { label: "Renamed",     pill: "bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-800", border: "border-l-purple-400 dark:border-l-purple-500" },
  moved:         { label: "Moved",       pill: "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800",         border: "border-l-blue-400 dark:border-l-blue-500" },
  "type-change": { label: "Type Change", pill: "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800",  border: "border-l-amber-400 dark:border-l-amber-500" },
  added:         { label: "Added",       pill: "bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/40 dark:text-green-200 dark:border-green-800",  border: "border-l-green-400 dark:border-l-green-500" },
  changed:       { label: "Changed",     pill: "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800",  border: "border-l-amber-400 dark:border-l-amber-500" },
  unchanged:     { label: "Unchanged",   pill: "bg-secondary text-muted-foreground border border-border dark:bg-secondary dark:text-muted-foreground/70",    border: "border-l-input" },
};

function formatValue(val) {
  if (val === undefined || val === null) return "null";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function formatValuePretty(val) {
  if (val === undefined || val === null) return "null";
  if (typeof val === "object") {
    try { return JSON.stringify(val, null, 2); } catch { return String(val); }
  }
  return String(val);
}

const LONG_VALUE_THRESHOLD = 48;

/**
 * Renders an old/new diff value as a pill.
 * - Short values: same compact pill as before (no regression in row density).
 * - Long values: clickable pill with line-clamp preview; opens a popover with
 *   pretty-printed value in a monospace block + copy-to-clipboard.
 */
function DiffValuePill({ value, variant }) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const text = formatValue(value);
  const pretty = formatValuePretty(value);
  const isLong = text.length > LONG_VALUE_THRESHOLD;

  // Color grammar preserved: red = removed, green = added. Dark-mode variants added.
  const tone = variant === "removed"
    ? "bg-red-50 text-red-600 border border-red-200 line-through dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/70"
    : "bg-green-50 text-green-600 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800/70";

  if (!isLong) {
    return (
      <span
        className={`px-1.5 py-0.5 rounded ${tone} w-fit max-w-[200px] truncate`}
        title={text}
      >
        {text}
      </span>
    );
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(pretty);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard unavailable; swallow quietly.
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Expand ${variant} value`}
          className={`text-left px-1.5 py-0.5 rounded ${tone} w-fit max-w-[280px] line-clamp-2 whitespace-pre-wrap break-words cursor-pointer hover:brightness-95 dark:hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-ring dark:focus:ring-ring`}
        >
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(520px,90vw)] p-0 bg-white dark:bg-background border-border"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground/70">
            {variant === "removed" ? "Old value" : "New value"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCopy}
            className="h-7 px-2 text-xs text-foreground/80 dark:text-muted-foreground/70 hover:bg-secondary dark:hover:bg-secondary"
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre
          className={`m-0 max-h-80 overflow-auto px-3 py-2 text-xs font-mono whitespace-pre-wrap break-words ${
            variant === "removed"
              ? "text-red-700 dark:text-red-300"
              : "text-green-700 dark:text-green-300"
          }`}
        >
          {pretty}
        </pre>
      </PopoverContent>
    </Popover>
  );
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
    <span className="inline-flex flex-wrap items-center gap-x-0.5 font-mono text-[10px] sm:text-xs leading-relaxed">
      {segs.map((seg, i) => {
        const partialPath = segs.slice(0, i + 1).join(".");
        const isDiff = i >= highlightFrom;
        return (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-muted-foreground/70 dark:text-foreground/80 select-none">/</span>}
            <span
              onClick={() => onPathClick && onPathClick(partialPath, side)}
              className={`cursor-pointer px-0.5 rounded transition-colors ${
                isDiff
                  ? "font-semibold text-foreground bg-secondary hover:bg-accent dark:text-foreground dark:bg-secondary dark:hover:bg-accent"
                  : "text-muted-foreground/70 hover:text-foreground/80 dark:text-muted-foreground dark:hover:text-muted-foreground/70"
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

function DiffItem({ result, onPathClick }) {
  const config = typeConfig[result.type] || typeConfig.changed;
  const isRenamed = (result.type === "renamed" || result.type === "moved") && result.newPath;
  const split = isRenamed ? splitCommonPrefix(result.path, result.newPath) : null;

  const confidence = result.confidence;
  const confidenceLabel = confidence != null ? `${Math.round(confidence * 100)}%` : null;
  const confidenceColor = confidence == null ? "" :
    confidence >= 0.85 ? "text-green-600 dark:text-green-400" :
    confidence >= 0.6  ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400";

  const side = result.type === "added" ? "right"
    : result.type === "removed" ? "left"
    : "both";

  return (
    <tr className={`border-b border-border dark:border-border hover:bg-muted/80 dark:hover:bg-secondary/50 transition-colors border-l-2 ${config.border}`}>

      {/* Path column */}
      <td className="px-4 py-3">
        {isRenamed ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-red-50 text-red-500 border border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800">OLD</span>
              <PathBreadcrumb
                segs={pathSegments(result.path)}
                highlightFrom={split.common.length}
                side="left"
                onPathClick={onPathClick}
              />
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-green-50 text-green-600 border border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800">NEW</span>
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
            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 line-through dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/70">{result.oldType}</span>
            <span className="text-muted-foreground/70 dark:text-muted-foreground">→</span>
            <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800/70">{result.newType}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {result.old !== undefined && (
              <DiffValuePill value={result.old} variant="removed" />
            )}
            {result.new !== undefined && (
              <DiffValuePill value={result.new} variant="added" />
            )}
            {result.old === undefined && result.new === undefined && (
              <span className="text-muted-foreground/70 dark:text-foreground/80">—</span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// Memoize with default shallow comparison on { result, onPathClick }.
// enrichDiffWithRenames preserves object references for entries that didn't
// change across the pass-1 → pass-2 transition (unchanged / changed /
// type-change rows come through as the same JS objects), so only the rows
// that actually became renames/moves re-render. Cuts the pass-2 message-
// handler cost from ~1.7s to a small fraction for large tables.
//
// Also side-steps a Fast Refresh / HMR stack-overflow bug that fires when
// editing DiffResults while a long table is mounted: React Refresh's
// scheduleFibersWithFamiliesRecursively walks the fiber tree and blows the
// stack on deep tables, but memoized components are treated differently and
// the recursion stays bounded.
export default React.memo(DiffItem);