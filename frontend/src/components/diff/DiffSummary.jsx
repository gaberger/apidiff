import React from "react";
import { Plus, Minus, RefreshCw, GitCompareArrows } from "lucide-react";
import { motion } from "framer-motion";

const stats = [
  { key: "added", label: "Added", icon: Plus, color: "added" },
  { key: "removed", label: "Removed", icon: Minus, color: "removed" },
  { key: "modified", label: "Modified", icon: RefreshCw, color: "modified" },
  { key: "total", label: "Total Changes", icon: GitCompareArrows, color: null },
];

export default function DiffSummary({ summary }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s, i) => {
        const Icon = s.icon;
        const count = s.key === "total"
          ? (summary.added || 0) + (summary.removed || 0) + (summary.modified || 0)
          : summary[s.key] || 0;

        return (
          <motion.div
            key={s.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={s.color ? {
                  backgroundColor: `hsl(var(--diff-${s.color}-bg))`,
                  color: `hsl(var(--diff-${s.color}))`
                } : {}}
              >
                <Icon className="w-4 h-4" style={!s.color ? { color: 'hsl(var(--muted-foreground))' } : {}} />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {s.label}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{count}</p>
          </motion.div>
        );
      })}
    </div>
  );
}