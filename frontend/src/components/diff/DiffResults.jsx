import React, { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DiffItem from "./DiffItem";
import { motion } from "framer-motion";

const filters = [
  { value: "all", label: "All" },
  { value: "added", label: "Added" },
  { value: "removed", label: "Removed" },
  { value: "modified", label: "Modified" },
];

export default function DiffResults({ changes }) {
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all"
    ? changes
    : changes.filter((c) => c.type === filter);

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
                    {changes.filter((c) => c.type === f.value).length}
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
          filtered.map((item, i) => (
            <DiffItem key={`${item.type}-${item.path || item.name}-${i}`} item={item} />
          ))
        )}
      </div>
    </div>
  );
}