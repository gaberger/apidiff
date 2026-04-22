import React from "react";
import { motion } from "framer-motion";

const chipConfig = [
  { key: "removed",     label: "Removed",     bg: "bg-red-100",    text: "text-red-600",    border: "border-red-200",    hoverBg: "hover:bg-red-200" },
  { key: "renamed",     label: "Renamed",     bg: "bg-purple-100", text: "text-purple-600", border: "border-purple-200", hoverBg: "hover:bg-purple-200" },
  { key: "moved",       label: "Moved",       bg: "bg-blue-100",   text: "text-blue-600",   border: "border-blue-200",   hoverBg: "hover:bg-blue-200" },
  { key: "type-change", label: "Type Change", bg: "bg-amber-100",  text: "text-amber-600",  border: "border-amber-200",  hoverBg: "hover:bg-amber-200" },
  { key: "added",       label: "Added",       bg: "bg-green-100",  text: "text-green-600",  border: "border-green-200",  hoverBg: "hover:bg-green-200" },
  { key: "changed",     label: "Changed",     bg: "bg-amber-100",  text: "text-amber-600",  border: "border-amber-200",  hoverBg: "hover:bg-amber-200" },
  { key: "breaking",    label: "Breaking",    bg: "bg-red-50",     text: "text-red-700",    border: "border-red-300",    hoverBg: "hover:bg-red-100" },
];

export default function DiffSummary({ results, summaryCounts, activeFilter, onFilterChange }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.04 } },
      }}
      className="flex flex-wrap gap-2"
    >
      {/* "All" chip */}
      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
      >
        <button
          onClick={() => onFilterChange("all")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
            activeFilter === "all"
              ? "bg-stone-800 text-white border-stone-800"
              : "bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200"
          }`}
        >
          All
          <span className="tabular-nums">
            {summaryCounts
              ? summaryCounts.removed + summaryCounts.added + summaryCounts.changed + summaryCounts["type-change"] + summaryCounts.renamed + summaryCounts.moved
              : results.filter((r) => r.type !== "unchanged").length}
          </span>
        </button>
      </motion.div>

      {chipConfig.map((chip) => {
        const count = summaryCounts ? (summaryCounts[chip.key] ?? 0) : results.filter((r) => r.type?.toLowerCase() === chip.key).length;
        if (count === 0) return null;

        const isActive = activeFilter?.toLowerCase() === chip.key.toLowerCase();

        return (
          <motion.div
            key={chip.key}
            variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
          >
            <button
              onClick={() => onFilterChange(chip.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                isActive
                  ? `${chip.bg} ${chip.text} ${chip.border} ring-2 ring-offset-1 ring-current`
                  : `${chip.bg} ${chip.text} ${chip.border} ${chip.hoverBg}`
              }`}
            >
              {chip.label}
              <span className="tabular-nums">{count}</span>
            </button>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
