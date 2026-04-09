import React, { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DiffItem from "./DiffItem";
import { motion } from "framer-motion";

const BREAKING_TYPES = ["removed", "type-change", "renamed", "moved"];

const filters = [
  { value: "all", label: "All" },
  { value: "breaking", label: "Breaking" },
  { value: "added", label: "Added" },
  { value: "changed", label: "Changed" },
];

function filterResults(results, filter) {
  const nonUnchanged = results.filter((r) => r.type !== "unchanged");
  if (filter === "all") return nonUnchanged;
  if (filter === "breaking") return nonUnchanged.filter((r) => BREAKING_TYPES.includes(r.type));
  if (filter === "changed") return nonUnchanged.filter((r) => ["changed", "renamed", "moved", "type-change"].includes(r.type));
  return nonUnchanged.filter((r) => r.type === filter);
}

export default function DiffResults({ results }) {
  const [filter, setFilter] = useState("all");
  const filtered = filterResults(results, filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Changes</h2>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="h-8">
            {filters.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="text-xs px-3 h-7">
                {f.label}
                {f.value !== "all" && (
                  <span className="ml-1.5 text-muted-foreground">
                    {filterResults(results, f.value).length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 text-muted-foreground text-sm"
          >
            No {filter === "all" ? "" : filter} changes found
          </motion.div>
        ) : (
          filtered.map((result, i) => (
            <DiffItem key={`${result.type}-${result.path}-${i}`} result={result} />
          ))
        )}
      </div>
    </div>
  );
}
