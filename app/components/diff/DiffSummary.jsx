import React from "react";
import { Plus, Minus, RefreshCw, ArrowRight, MoveRight, AlertTriangle, GitCompareArrows } from "lucide-react";
import { motion } from "framer-motion";

const BREAKING_TYPES = ["removed", "type-change", "renamed", "moved"];

const stats = [
  { key: "removed", label: "Removed", icon: Minus, color: "removed" },
  { key: "added", label: "Added", icon: Plus, color: "added" },
  { key: "modified", label: "Modified", icon: RefreshCw, color: "modified" },
  { key: "breaking", label: "Breaking", icon: AlertTriangle, color: "removed" },
];

export default function DiffSummary({ results }) {
  const counts = {
    removed: results.filter((r) => r.type === "removed").length,
    added: results.filter((r) => r.type === "added").length,
    modified: results.filter((r) => ["changed", "renamed", "moved", "type-change"].includes(r.type)).length,
    breaking: results.filter((r) => BREAKING_TYPES.includes(r.type)).length,
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s, i) => {
        const Icon = s.icon;
        const count = counts[s.key] || 0;

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
                style={{
                  backgroundColor: `hsl(var(--diff-${s.color}-bg))`,
                  color: `hsl(var(--diff-${s.color}))`
                }}
              >
                <Icon className="w-4 h-4" />
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
