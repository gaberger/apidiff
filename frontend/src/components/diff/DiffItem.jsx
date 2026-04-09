import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Plus, Minus, RefreshCw } from "lucide-react";

const typeConfig = {
  added: { icon: Plus, color: "added", label: "Added" },
  removed: { icon: Minus, color: "removed", label: "Removed" },
  modified: { icon: RefreshCw, color: "modified", label: "Modified" },
};

function MethodBadge({ method }) {
  const colors = {
    get: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    post: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    put: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    patch: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    delete: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    head: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    options: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${colors[method?.toLowerCase()] || colors.get}`}>
      {method}
    </span>
  );
}

export default function DiffItem({ item }) {
  const [expanded, setExpanded] = useState(false);
  const config = typeConfig[item.type] || typeConfig.modified;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="group rounded-lg border border-border bg-card overflow-hidden transition-shadow hover:shadow-sm"
    >
      <button
        onClick={() => setExpanded(!expanded)}
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

        {item.method && <MethodBadge method={item.method} />}

        <span className="font-mono text-sm text-foreground flex-1 truncate">
          {item.path || item.name}
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

        {item.details && item.details.length > 0 && (
          <ChevronRight
            className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        )}
      </button>

      <AnimatePresence>
        {expanded && item.details && item.details.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0">
              <div className="rounded-md bg-muted/50 border border-border/50 divide-y divide-border/50">
                {item.details.map((detail, i) => (
                  <div key={i} className="px-3 py-2.5 text-xs">
                    <span className="text-muted-foreground">{detail.field}: </span>
                    {detail.before !== undefined && (
                      <span className="font-mono text-diff-removed line-through mr-2">
                        {String(detail.before)}
                      </span>
                    )}
                    {detail.after !== undefined && (
                      <span className="font-mono text-diff-added">
                        {String(detail.after)}
                      </span>
                    )}
                    {detail.description && (
                      <span className="text-muted-foreground ml-1">— {detail.description}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}