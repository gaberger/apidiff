import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { GitCompareArrows, Loader2, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SpecInput from "../components/diff/SpecInput";
import DiffSummary from "../components/diff/DiffSummary";
import DiffResults from "../components/diff/DiffResults";
import EmptyState from "../components/diff/EmptyState";
import { fetchDiff, parseSpecFile } from "@/api/apidiff-client";

const BREAKING_TYPES = ["removed", "type-change", "renamed", "moved"];

export default function DiffViewer() {
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCompare = async () => {
    if (!before.trim() || !after.trim()) return;
    setLoading(true);
    setResults(null);
    setError(null);

    try {
      // Parse specs — try JSON first, fall back to YAML via server
      let oldSpec, newSpec;
      try {
        oldSpec = JSON.parse(before.trim());
      } catch {
        const parsed = await parseSpecFile(before.trim(), "old.yaml");
        oldSpec = parsed.document;
      }
      try {
        newSpec = JSON.parse(after.trim());
      } catch {
        const parsed = await parseSpecFile(after.trim(), "new.yaml");
        newSpec = parsed.document;
      }

      const diffResults = await fetchDiff(oldSpec, newSpec);
      setResults(diffResults);
    } catch (e) {
      setError(e.message || "Comparison failed");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setBefore("");
    setAfter("");
    setResults(null);
    setError(null);
  };

  const canCompare = before.trim() && after.trim() && !loading;

  const breakingCount = results
    ? results.filter((r) => BREAKING_TYPES.includes(r.type)).length
    : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <GitCompareArrows className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-foreground tracking-tight">apidiff</h1>
                <p className="text-[11px] text-muted-foreground -mt-0.5">API migration toolkit</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {results && (
                <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 text-xs">
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Reset
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleCompare}
                disabled={!canCompare}
                className="h-8 px-4 text-xs font-semibold"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Comparing...
                  </>
                ) : (
                  <>
                    <GitCompareArrows className="w-3.5 h-3.5 mr-1.5" />
                    Compare
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Input panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <SpecInput
            label="Original Spec"
            value={before}
            onChange={setBefore}
            badge="Before"
            badgeColor="removed"
          />
          <SpecInput
            label="Updated Spec"
            value={after}
            onChange={setAfter}
            badge="After"
            badgeColor="added"
          />
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-4 mb-6"
          >
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </motion.div>
        )}

        {/* Results */}
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-24"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-muted-foreground animate-spin" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-5">Comparing specs...</p>
            </motion.div>
          )}

          {!loading && results && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-foreground">
                  {results.filter((r) => r.type !== "unchanged").length} changes detected
                </h2>
                {breakingCount > 0 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-diff-removed-bg text-diff-removed">
                    {breakingCount} breaking
                  </span>
                )}
              </div>

              <DiffSummary results={results} />
              <DiffResults results={results} />
            </motion.div>
          )}

          {!loading && !results && !error && (
            <EmptyState key="empty" />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
