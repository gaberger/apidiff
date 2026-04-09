import React from "react";
import { GitCompareArrows } from "lucide-react";
import { motion } from "framer-motion";

export default function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-6">
        <GitCompareArrows className="w-9 h-9 text-muted-foreground/60" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        Compare API Specs
      </h3>
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
        Paste or upload your before and after OpenAPI / Swagger specs above,
        then click <strong>Compare</strong> to see a visual diff of all changes.
      </p>
      <div className="flex items-center gap-6 mt-8 text-xs text-muted-foreground/60">
        <span>OpenAPI 3.x</span>
        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
        <span>Swagger 2.0</span>
        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
        <span>JSON & YAML</span>
      </div>
    </motion.div>
  );
}