import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GitCompareArrows, RotateCcw, FileText, Loader2, Sun, Moon, Settings as SettingsIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "@/hooks/use-theme.js";
import { motion, AnimatePresence } from "framer-motion";
import SpecInput from "@/components/diff/SpecInput";
import DiffResults from "@/components/diff/DiffResults";
import EmptyState from "@/components/diff/EmptyState";
import IntegrationList from "@/components/sidebar/IntegrationList";
import IntegrationHeader from "@/components/diff/IntegrationHeader";
import MigrationGuide from "@/components/guide/MigrationGuide";
import { useSyncedScroll } from "@/hooks/use-synced-scroll";
import { computeDiff } from "@/lib/domain/diff-algorithm.js";
import { buildGuide } from "@/lib/domain/guide-builder.js";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import YAML from "yaml";

// Parse an OpenAPI spec text as JSON, then YAML as a fallback. Throws with a
// descriptive error if neither parser accepts it. Accepting both formats means
// discovery can surface *.yaml|*.yml files from repos without forcing users to
// convert them manually.
function parseSpec(text, sideLabel) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`${sideLabel} spec is empty`);
  // Heuristic: JSON specs start with { or [; everything else → YAML.
  const looksJson = trimmed[0] === "{" || trimmed[0] === "[";
  if (looksJson) {
    try { return JSON.parse(trimmed); }
    catch (jsonErr) {
      // Fall through to YAML — some JSON-looking specs have trailing commas or
      // comments that YAML's superset parser accepts.
      try { return YAML.parse(trimmed); }
      catch { throw new Error(`${sideLabel}: not valid JSON — ${jsonErr.message}`); }
    }
  }
  try { return YAML.parse(trimmed); }
  catch (yamlErr) {
    throw new Error(`${sideLabel}: not valid JSON or YAML — ${yamlErr.message}`);
  }
}

export default function DiffViewer() {
  // Editor state
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [results, setResults] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [error, setError] = useState(null);

  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth < 768);
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [activeTab, setActiveTab] = useState("compare"); // "compare" | "guide"
  const [guide, setGuide] = useState(null);
  const [guideForm, setGuideForm] = useState({ baseVersion: "v1", revisionVersion: "v2", sunsetDate: "" });

  // Refs for synced scroll
  const leftEditorRef = useRef(null);
  const rightEditorRef = useRef(null);
  const { scrollLocked, toggleScrollLock, suppressSync } = useSyncedScroll(leftEditorRef, rightEditorRef);

  // Theme
  const { theme, toggle: toggleTheme } = useTheme();

  // Flash highlight for path click
  const [leftHighlight, setLeftHighlight] = useState(null);
  const [rightHighlight, setRightHighlight] = useState(null);

  const [resolving, setResolving] = useState(false);
  const [refsResolved, setRefsResolved] = useState(null); // { old: number, new: number } | null

  const handleCompare = async () => {
    if (!before.trim() || !after.trim()) return;
    setResults(null);
    setGuide(null);
    setError(null);
    setActiveFilter("all");

    try {
      let oldSpec = parseSpec(before, "Original spec");
      let newSpec = parseSpec(after, "Updated spec");

      // Collect $ref locations before resolving, then annotate after
      const collectRefs = (obj, prefix = "") => {
        const refs = [];
        if (obj && typeof obj === "object") {
          if (obj["$ref"]) refs.push({ path: prefix, target: obj["$ref"] });
          for (const [k, v] of Object.entries(obj)) {
            if (k === "$ref") continue;
            refs.push(...collectRefs(v, prefix ? prefix + "." + k : k));
          }
        }
        return refs;
      };
      const oldRefs = collectRefs(oldSpec);
      const newRefs = collectRefs(newSpec);

      if (oldRefs.length > 0 || newRefs.length > 0) {
        setResolving(true);
        try {
          if (oldRefs.length > 0) oldSpec = await $RefParser.dereference(structuredClone(oldSpec));
          if (newRefs.length > 0) newSpec = await $RefParser.dereference(structuredClone(newSpec));

          // Annotate resolved JSON: inject __$ref markers at locations that were references
          const annotate = (obj, refs) => {
            for (const ref of refs) {
              const parts = ref.path.split(".");
              let node = obj;
              for (let i = 0; i < parts.length - 1; i++) {
                if (node && typeof node === "object") node = node[parts[i]];
              }
              const lastKey = parts[parts.length - 1];
              if (node && typeof node === "object" && node[lastKey] && typeof node[lastKey] === "object") {
                node[lastKey]["__$ref"] = ref.target;
              }
            }
          };
          annotate(oldSpec, oldRefs);
          annotate(newSpec, newRefs);

          setBefore(JSON.stringify(oldSpec, null, 2));
          setAfter(JSON.stringify(newSpec, null, 2));
          setRefsResolved({ old: oldRefs.length, new: newRefs.length });
        } finally {
          setResolving(false);
        }
      } else {
        setRefsResolved(null);
      }

      setResults(computeDiff(oldSpec, newSpec));
    } catch (e) {
      setResolving(false);
      setError(e.message || "Invalid JSON — paste valid JSON specs");
    }
  };

  const handleGenerateGuide = () => {
    if (!before.trim() || !after.trim()) return;
    try {
      const oldSpec = JSON.parse(before.trim());
      const newSpec = JSON.parse(after.trim());
      const diffs = results || computeDiff(oldSpec, newSpec);
      const g = buildGuide(diffs, guideForm.baseVersion, guideForm.revisionVersion, guideForm.sunsetDate || undefined);
      setGuide(g);
      setActiveTab("guide");
    } catch (e) {
      setError(e.message || "Failed to generate guide");
    }
  };

  const handleLoadSpecs = async (v1, v2, label) => {
    const v1Str = typeof v1 === 'string' ? v1 : JSON.stringify(v1, null, 2);
    const v2Str = typeof v2 === 'string' ? v2 : JSON.stringify(v2, null, 2);
    setBefore(v1Str);
    setAfter(v2Str);
    setResults(null);
    setGuide(null);
    setError(null);
    setActiveFilter("all");
    setActiveTab("compare");
    try {
      let oldSpec = typeof v1 === 'string' ? JSON.parse(v1) : structuredClone(v1);
      let newSpec = typeof v2 === 'string' ? JSON.parse(v2) : structuredClone(v2);
      const hasRefs = (obj) => JSON.stringify(obj).includes('"$ref"');
      if (hasRefs(oldSpec) || hasRefs(newSpec)) {
        setResolving(true);
        try {
          if (hasRefs(oldSpec)) oldSpec = await $RefParser.dereference(oldSpec);
          if (hasRefs(newSpec)) newSpec = await $RefParser.dereference(newSpec);
          setBefore(JSON.stringify(oldSpec, null, 2));
          setAfter(JSON.stringify(newSpec, null, 2));
        } finally {
          setResolving(false);
        }
      }
      setResults(computeDiff(oldSpec, newSpec));
    } catch (e) {
      setResolving(false);
      setError(e.message);
    }
  };

  const handleReset = () => {
    setBefore("");
    setAfter("");
    setResults(null);
    setGuide(null);
    setActiveFilter("all");
    setError(null);
    setRefsResolved(null);
    setActiveTab("compare");
  };

  // Scroll a textarea to the line matching a dot-path.
  // Handles keys containing dots (e.g., OpenAPI path segments like
  // "/2010-04-01/Accounts/{AccountSid}/Messages/{Sid}.json")
  // by matching actual JSON keys against remaining path string.
  const scrollToPath = useCallback((textarea, pathStr) => {
    if (!textarea || !pathStr) return -1;
    const lines = textarea.value.split("\n");
    let remaining = pathStr;
    let targetLine = -1;
    let expectedIndent = -1;

    for (let i = 0; i < lines.length && remaining.length > 0; i++) {
      const line = lines[i];
      const indent = line.search(/\S/);
      if (indent === -1) continue;

      const keyMatch = line.match(/^\s*"([^"]+)"\s*:/);
      if (!keyMatch) continue;

      const key = keyMatch[1];

      // Check if the remaining path starts with this key
      if (remaining === key || remaining.startsWith(key + ".")) {
        if (targetLine === -1 || indent > expectedIndent) {
          expectedIndent = indent;
          targetLine = i;
          // Consume this key from the remaining path
          if (remaining === key) {
            remaining = "";
          } else {
            remaining = remaining.slice(key.length + 1); // +1 for the dot
          }
        }
      }
    }

    if (targetLine >= 0) {
      // Use computed CSS line-height — scrollHeight/totalLines is an average that
      // breaks whenever the textarea wraps long lines. Include paddingTop so line 0
      // is at the top of the visible text, not the top of the padding box.
      const cs = window.getComputedStyle(textarea);
      const lineHeight = parseFloat(cs.lineHeight) || 20;
      const paddingTop = parseFloat(cs.paddingTop) || 0;
      const targetY = paddingTop + targetLine * lineHeight;
      textarea.scrollTop = Math.max(0, targetY - textarea.clientHeight / 3);
    }
    return targetLine;
  }, []);

  // Path click: scrolls the appropriate editor(s) based on change type
  // "left" = old editor only, "right" = new editor only, "both" = both editors
  const handlePathClick = useCallback((clickedPath, side) => {
    suppressSync();
    if (side === "left" || side === "both") {
      const line = scrollToPath(leftEditorRef.current, clickedPath);
      setLeftHighlight(line);
    }
    if (side === "right" || side === "both") {
      const line = scrollToPath(rightEditorRef.current, clickedPath);
      setRightHighlight(line);
    }
    if (side === "left") setRightHighlight(null);
    if (side === "right") setLeftHighlight(null);
  }, [scrollToPath, suppressSync]);

  const canCompare = before.trim() && after.trim();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canCompare && !resolving) {
        e.preventDefault();
        handleCompare();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canCompare, resolving, before, after]);

  const shortcutHint = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘↵" : "Ctrl+↵";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/40 text-foreground flex flex-col transition-colors duration-base ease-standard">
      {/* Header */}
      <header className="border-b border-border bg-background/70 dark:bg-background/60 backdrop-blur-xl sticky top-0 z-20 shadow-e1 transition-shadow duration-base ease-standard">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
        <div className="px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm font-bold tracking-tight whitespace-nowrap">
                <span className="text-foreground">api</span>
                <span className="bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">diff</span>
              </h1>
              <nav className="ml-2 sm:ml-6 flex items-center gap-1">
                <button
                  onClick={() => setActiveTab("compare")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-all duration-fast ease-standard ${
                    activeTab === "compare"
                      ? "text-foreground bg-secondary shadow-e1"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  Compare
                </button>
                <button
                  onClick={() => guide && setActiveTab("guide")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-all duration-fast ease-standard ${
                    activeTab === "guide"
                      ? "text-foreground bg-secondary shadow-e1"
                      : guide
                        ? "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                        : "text-muted-foreground/50 cursor-not-allowed"
                  }`}
                >
                  Guide
                </button>
              </nav>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Settings link */}
              <Link
                to="/settings"
                aria-label="Settings"
                className="p-1.5 rounded-md text-xs bg-secondary text-muted-foreground hover:text-foreground hover:shadow-e2 hover:-translate-y-px transition-all duration-fast ease-standard inline-flex items-center"
                title="Discover specs, manage integrations"
              >
                <SettingsIcon className="w-3.5 h-3.5" />
              </Link>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="p-1.5 rounded-md text-xs bg-secondary text-muted-foreground hover:text-foreground hover:shadow-e2 hover:-translate-y-px transition-all duration-fast ease-standard"
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark"
                  ? <Sun className="w-3.5 h-3.5" />
                  : <Moon className="w-3.5 h-3.5" />}
              </button>

              {/* Scroll lock toggle */}
              <button
                onClick={toggleScrollLock}
                className={`p-1.5 rounded-md text-xs transition-all duration-fast ease-standard hover:shadow-e2 hover:-translate-y-px ${
                  scrollLocked
                    ? "bg-amber-100 text-amber-700 shadow-e1 dark:bg-amber-500/20 dark:text-amber-300"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
                title={scrollLocked ? "Scroll sync: ON" : "Scroll sync: OFF"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {scrollLocked ? (
                    <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>
                  ) : (
                    <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></>
                  )}
                </svg>
              </button>

              {results && (
                <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 text-xs">
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Reset
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleCompare}
                disabled={!canCompare || resolving}
                title={canCompare ? `Compare specs (${shortcutHint})` : "Paste JSON into both panels to compare"}
                className="h-8 px-2 sm:px-4 text-xs font-semibold bg-gradient-to-b from-primary to-primary/90 hover:shadow-e3 hover:-translate-y-px transition-all duration-fast ease-standard disabled:translate-y-0 disabled:shadow-none"
              >
                {resolving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Resolving $refs...
                  </>
                ) : (
                  <>
                    <GitCompareArrows className="w-3.5 h-3.5 mr-1.5" />
                    Compare
                    {canCompare && (
                      <kbd className="hidden sm:inline-flex ml-1.5 px-1 py-0.5 text-[10px] font-mono bg-white/20 rounded">{shortcutHint}</kbd>
                    )}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar + Main */}
      <div className="flex flex-1 overflow-hidden">
        <IntegrationList
          selected={selectedIntegration}
          onSelect={setSelectedIntegration}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <main className="flex-1 overflow-y-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          <AnimatePresence mode="wait">
            {/* ═══ COMPARE TAB ═══ */}
            {activeTab === "compare" && (
              <motion.div
                key="compare"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* $ref resolution notice */}
                {refsResolved && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-700">
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    <span>
                      <strong>$ref resolved</strong> — {refsResolved.old + refsResolved.new} reference{refsResolved.old + refsResolved.new !== 1 ? "s" : ""} inlined
                      {refsResolved.old > 0 && <span> ({refsResolved.old} in old spec)</span>}
                      {refsResolved.new > 0 && <span> ({refsResolved.new} in new spec)</span>}
                      . Editors show expanded content.
                    </span>
                  </div>
                )}

                {/* Integration header with version picker */}
                {selectedIntegration && (
                  <IntegrationHeader
                    integration={selectedIntegration}
                    onLoadSpecs={handleLoadSpecs}
                    onClear={() => setSelectedIntegration(null)}
                  />
                )}

                {/* Input panels */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
                  <SpecInput
                    label="Original Spec"
                    value={before}
                    onChange={setBefore}
                    badge="Before"
                    badgeColor="removed"
                    results={results}
                    textareaRef={leftEditorRef}
                    highlightLine={leftHighlight}
                  />
                  <SpecInput
                    label="Updated Spec"
                    value={after}
                    onChange={setAfter}
                    badge="After"
                    badgeColor="added"
                    results={results}
                    textareaRef={rightEditorRef}
                    highlightLine={rightHighlight}
                  />
                </div>

                {/* Error */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-lg border border-red-200 bg-red-50 p-4 mb-6 flex items-start justify-between gap-3"
                    role="alert"
                  >
                    <p className="text-sm text-red-700 flex-1">{error}</p>
                    <button
                      onClick={() => setError(null)}
                      aria-label="Dismiss error"
                      className="text-red-400 hover:text-red-600 shrink-0 -mt-0.5"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </motion.div>
                )}

                {/* Results */}
                {results && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <h2 className="text-base sm:text-lg font-bold text-stone-800">
                      {results.filter((r) => r.type !== "unchanged").length} changes detected
                    </h2>

                    <DiffResults
                      results={results}
                      activeFilter={activeFilter}
                      onFilterChange={setActiveFilter}
                      onPathClick={handlePathClick}
                    />

                    {/* Guide generation form */}
                    <div className="border border-stone-200 rounded-lg bg-white p-3 sm:p-4">
                      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
                        Generate Migration Guide
                      </h3>
                      <div className="flex items-end gap-2 sm:gap-3 flex-wrap">
                        <div>
                          <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Base</label>
                          <input
                            value={guideForm.baseVersion}
                            onChange={(e) => setGuideForm({ ...guideForm, baseVersion: e.target.value })}
                            className="w-24 px-2 py-1.5 text-sm border border-stone-200 rounded-md bg-stone-50 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Revision</label>
                          <input
                            value={guideForm.revisionVersion}
                            onChange={(e) => setGuideForm({ ...guideForm, revisionVersion: e.target.value })}
                            className="w-24 px-2 py-1.5 text-sm border border-stone-200 rounded-md bg-stone-50 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Sunset</label>
                          <input
                            type="date"
                            value={guideForm.sunsetDate}
                            onChange={(e) => setGuideForm({ ...guideForm, sunsetDate: e.target.value })}
                            className="px-2 py-1.5 text-sm border border-stone-200 rounded-md bg-stone-50"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateGuide}
                          className="h-8 text-xs"
                        >
                          <FileText className="w-3.5 h-3.5 mr-1.5" />
                          Generate
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {!results && !error && (
                  <EmptyState />
                )}
              </motion.div>
            )}

            {/* ═══ GUIDE TAB ═══ */}
            {activeTab === "guide" && guide && (
              <motion.div
                key="guide"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <MigrationGuide
                  guide={guide}
                  onClose={() => setActiveTab("compare")}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}