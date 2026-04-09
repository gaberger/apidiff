import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { GitCompareArrows, Loader2, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SpecInput from "../components/diff/SpecInput";
import DiffSummary from "../components/diff/DiffSummary";
import DiffResults from "../components/diff/DiffResults";
import EmptyState from "../components/diff/EmptyState";

export default function DiffViewer() {
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCompare = async () => {
    if (!before.trim() || !after.trim()) return;
    setLoading(true);
    setResult(null);

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an API specification diff analyzer. Compare the two API specs below and produce a structured diff.

BEFORE SPEC:
\`\`\`
${before.trim()}
\`\`\`

AFTER SPEC:
\`\`\`
${after.trim()}
\`\`\`

Analyze every endpoint, parameter, schema, response, and security change. For each change, determine if it was ADDED, REMOVED, or MODIFIED.

For modified items, include detailed before/after values for each changed field.`,
      response_json_schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Brief title of the diff, e.g. 'v1.0 → v1.1 API Changes'" },
          summary: {
            type: "object",
            properties: {
              added: { type: "number" },
              removed: { type: "number" },
              modified: { type: "number" },
              breaking: { type: "number", description: "Count of breaking changes" }
            }
          },
          changes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["added", "removed", "modified"] },
                category: { type: "string", description: "e.g. endpoint, schema, parameter, response, security" },
                method: { type: "string", description: "HTTP method if applicable (GET, POST, etc.)" },
                path: { type: "string", description: "Endpoint path or schema name" },
                name: { type: "string", description: "Readable name or description of the change" },
                breaking: { type: "boolean", description: "Whether this is a breaking change" },
                details: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string" },
                      before: { type: "string" },
                      after: { type: "string" },
                      description: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      model: "claude_sonnet_4_6"
    });

    setResult(res);
    setLoading(false);
  };

  const handleReset = () => {
    setBefore("");
    setAfter("");
    setResult(null);
  };

  const canCompare = before.trim() && after.trim() && !loading;

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
                <h1 className="text-sm font-bold text-foreground tracking-tight">API Spec Diff</h1>
                <p className="text-[11px] text-muted-foreground -mt-0.5">Visual comparison tool</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {result && (
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
                    Analyzing...
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
              <p className="text-sm text-muted-foreground mt-5">Analyzing spec differences...</p>
              <p className="text-xs text-muted-foreground/60 mt-1">This may take a moment for large specs</p>
            </motion.div>
          )}

          {!loading && result && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {result.title && (
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-foreground">{result.title}</h2>
                  {result.summary?.breaking > 0 && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-diff-removed-bg text-diff-removed">
                      {result.summary.breaking} breaking
                    </span>
                  )}
                </div>
              )}

              <DiffSummary summary={result.summary || {}} />
              <DiffResults changes={result.changes || []} />
            </motion.div>
          )}

          {!loading && !result && (
            <EmptyState key="empty" />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}