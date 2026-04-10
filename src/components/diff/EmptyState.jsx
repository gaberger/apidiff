import React from "react";
import { GitCompareArrows } from "lucide-react";
import { motion } from "framer-motion";

export default function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-12 sm:py-24 text-center px-4"
    >
      <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-muted flex items-center justify-center mb-4 sm:mb-6">
        <GitCompareArrows className="w-6 h-6 sm:w-9 sm:h-9 text-muted-foreground/60" />
      </div>
      <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">
        Compare API Specs
      </h3>
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
        Paste or upload your before and after OpenAPI / Swagger specs above,
        then click <strong>Compare</strong> to see a visual diff of all changes.
      </p>
      <div className="flex items-center gap-4 sm:gap-6 mt-6 sm:mt-8 text-xs text-muted-foreground/60">
        <span>OpenAPI 3.x</span>
        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
        <span>Swagger 2.0</span>
        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
        <span>JSON & YAML</span>
      </div>
    </motion.div>
  );
}