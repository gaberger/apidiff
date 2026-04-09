import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Plus, Minus, RefreshCw, ArrowRight, MoveRight, AlertTriangle } from "lucide-react";

const typeConfig = {
  added:         { icon: Plus,            color: "added",    label: "Added" },
  removed:       { icon: Minus,           color: "removed",  label: "Removed" },
  changed:       { icon: RefreshCw,       color: "modified", label: "Changed" },
  renamed:       { icon: ArrowRight,      color: "modified", label: "Renamed" },
  moved:         { icon: MoveRight,       color: "modified", label: "Moved" },
  "type-change": { icon: AlertTriangle,   color: "removed",  label: "Type Change" },
  unchanged:     { icon: RefreshCw,       color: "modified", label: "Unchanged" },
};

function formatValue(val) {
  if (val === undefined || val === null) return "null";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export default function DiffItem({ result }) {
  const [expanded, setExpanded] = useState(false);
  const config = typeConfig[result.type] || typeConfig.changed;
  const Icon = config.icon;

  const hasDetails =
    result.old !== undefined ||
    result.new !== undefined ||
    result.newPath ||
    result.oldType;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="group rounded-lg border border-border bg-card overflow-hidden transition-shadow hover:shadow-sm"
    >
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3.5 text-left"
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{
            backgroundColor: `hsl(var(--diff-${config.color}-bg))`,
            color: `hsl(var(--diff-${config.color}))`
          }}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>

        <span className="font-mono text-sm text-foreground flex-1 truncate">
          {result.path}
          {result.newPath && (
            <span className="text-muted-foreground"> → {result.newPath}</span>
          )}
        </span>

        <span
          className="text-[11px] font-medium px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `hsl(var(--diff-${config.color}-bg))`,
            color: `hsl(var(--diff-${config.color}))`
          }}
        >
          {config.label}
        </span>

        {hasDetails && (
          <ChevronRight
            className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        )}
      </button>

      <AnimatePresence>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0">
              <div className="rounded-md bg-muted/50 border border-border/50 divide-y divide-border/50">
                {result.old !== undefined && (
                  <div className="px-3 py-2.5 text-xs">
                    <span className="text-muted-foreground">old: </span>
                    <span className="font-mono text-diff-removed line-through">
                      {formatValue(result.old)}
                    </span>
                  </div>
                )}
                {result.new !== undefined && (
                  <div className="px-3 py-2.5 text-xs">
                    <span className="text-muted-foreground">new: </span>
                    <span className="font-mono text-diff-added">
                      {formatValue(result.new)}
                    </span>
                  </div>
                )}
                {result.oldType && result.newType && (
                  <div className="px-3 py-2.5 text-xs">
                    <span className="text-muted-foreground">type: </span>
                    <span className="font-mono text-diff-removed line-through mr-2">
                      {result.oldType}
                    </span>
                    <span className="text-muted-foreground">→ </span>
                    <span className="font-mono text-diff-added">
                      {result.newType}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
