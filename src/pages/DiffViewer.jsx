import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GitCompareArrows, RotateCcw, FileText, Loader2, Sun, Moon, Settings as SettingsIcon, HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "@/hooks/use-theme.js";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts.js";
import ShortcutsHelp from "@/components/diff/ShortcutsHelp.jsx";
import { motion, AnimatePresence } from "framer-motion";
import SpecInput from "@/components/diff/SpecInput";
import DiffResults from "@/components/diff/DiffResults";
import EmptyState from "@/components/diff/EmptyState";
import IntegrationList from "@/components/sidebar/IntegrationList";
import IntegrationHeader from "@/components/diff/IntegrationHeader";
import FetchProgress from "@/components/diff/FetchProgress";
import MigrationGuide from "@/components/guide/MigrationGuide";
import { useSyncedScroll } from "@/hooks/use-synced-scroll";
import { useDiffWorker } from "@/hooks/use-diff-worker.js";
import { computeDiff } from "@/lib/domain/diff-algorithm.js";
import { buildGuide } from "@/lib/domain/guide-builder.js";

// Parsing (JSON + YAML fallback) lives in src/workers/diff-worker.js so it
// runs off the main thread. handleGenerateGuide does its own JSON.parse on
// the already-resolved spec text — bounded cost since by then the user has
// seen a successful diff.

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
  const [fetchStages, setFetchStages] = useState([]);
  const { runDiff, cancel: cancelDiff } = useDiffWorker();
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
  const [helpOpen, setHelpOpen] = useState(false);

  const handleCompare = async () => {
    if (!before.trim() || !after.trim()) return;
    setResults(null);
    setGuide(null);
    setError(null);
    setActiveFilter("all");
    setResolving(true);

    const stages = [
      { id: "parse", label: "Parsing specs", status: "in-progress", cacheHit: false },
      { id: "deref", label: "Dereferencing $refs", status: "pending", cacheHit: false },
      { id: "diff-structural", label: "Computing structural diff", status: "pending", cacheHit: false },
      { id: "diff-fuzzy", label: "Detecting renames", status: "pending", cacheHit: false },
    ];
    setFetchStages(stages.map((s) => ({ ...s })));

    try {
      // Hand raw strings to the worker — parsing, cloning, dereferencing,
      // and diff all happen off the main thread. Previously parseSpec +
      // collectRefs + structuredClone-via-postMessage ran here and pushed
      // the click handler past 7s for multi-MB specs.
      const { results: workerResults, oldResolved, newResolved, refsResolved: rr } = await runDiff(before, after, {
        onProgress: (evt) => {
          if (evt.stage === "parsing") stages[0].status = "in-progress";
          if (evt.stage === "dereferencing") {
            stages[0].status = "complete";
            stages[1].status = "in-progress";
          }
          if (evt.stage === "diffing-structural") {
            stages[1].status = "complete";
            stages[2].status = "in-progress";
          }
          if (evt.stage === "diffing-fuzzy") {
            stages[2].status = "complete";
            stages[3].status = "in-progress";
          }
          setFetchStages(stages.map((s) => ({ ...s })));
        },
        // Two-pass: structural results land here first so the UI can paint
        // added/removed/changed badges in <1s on multi-MB specs. The full
        // enriched results (with rename + move detection) replace these
        // when the second pass completes.
        onPartial: (partialResults) => {
          setResults(partialResults);
        },
      });

      stages[3].status = "complete";
      setFetchStages(stages.map((s) => ({ ...s })));

      // Final enriched results: replaces the partial set in place. React
      // reconciles the diff list — added/removed entries that became
      // renames/moves swap their rendered row without remounting (stable
      // keys on path in DiffResults make this work).
      setResults(workerResults);
      setRefsResolved(rr);

      // Defer the heavy JSON.stringify of resolved specs and the textarea
      // re-renders to a microtask so they don't extend this click handler.
      // Capture scroll positions beforehand so setBefore/setAfter doesn't
      // yank the user out of whatever endpoint they were reading — the
      // dereferenced content has different line counts but the user was
      // likely navigating by proximity, so clamping scrollTop to the new
      // max is the least-surprising behavior.
      if (rr) {
        const leftScroll = leftEditorRef.current?.scrollTop ?? 0;
        const rightScroll = rightEditorRef.current?.scrollTop ?? 0;
        setTimeout(() => {
          setBefore(JSON.stringify(oldResolved, null, 2));
          setAfter(JSON.stringify(newResolved, null, 2));
          // Restore after React commits the new textarea content.
          requestAnimationFrame(() => {
            if (leftEditorRef.current) leftEditorRef.current.scrollTop = leftScroll;
            if (rightEditorRef.current) rightEditorRef.current.scrollTop = rightScroll;
          });
        }, 0);
      }
    } catch (e) {
      // Swallow user-initiated cancellations — Reset rejected the in-flight
      // diff on purpose; surfacing that as an error confuses users.
      if (e?.message === "cancelled") return;
      setError(e.message || "Invalid JSON — paste valid JSON specs");
    } finally {
      setResolving(false);
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
    // Drop the textareas to a tiny placeholder immediately so React's
    // controlled-input render of the previous (potentially multi-MB) value
    // doesn't compound with the new one. JSON.stringify of the new specs
    // and the corresponding textarea repaints are deferred to a microtask
    // after the worker completes — see the setTimeout below.
    setBefore("");
    setAfter("");
    setResults(null);
    setGuide(null);
    setError(null);
    setActiveFilter("all");
    setActiveTab("compare");
    setResolving(true);

    setFetchStages((prev) => [
      ...prev,
      { id: "deref", label: "Dereferencing $refs", status: "in-progress", cacheHit: false },
      { id: "diff-structural", label: "Computing structural diff", status: "pending", cacheHit: false },
      { id: "diff-fuzzy", label: "Detecting renames", status: "pending", cacheHit: false },
    ]);

    try {
      // Pass v1/v2 directly. The worker takes either string or object via
      // structured cloning at the postMessage boundary — for already-parsed
      // API responses, this avoids a redundant main-thread JSON.stringify
      // followed by JSON.parse inside the worker.
      const { results: workerResults, oldResolved, newResolved } = await runDiff(v1, v2, {
        onProgress: (evt) => {
          setFetchStages((prev) => prev.map((s) => {
            if (s.id === "deref" && evt.stage === "diffing-structural") return { ...s, status: "complete" };
            if (s.id === "diff-structural" && evt.stage === "diffing-structural") return { ...s, status: "in-progress" };
            if (s.id === "diff-structural" && evt.stage === "diffing-fuzzy") return { ...s, status: "complete" };
            if (s.id === "diff-fuzzy" && evt.stage === "diffing-fuzzy") return { ...s, status: "in-progress" };
            return s;
          }));
        },
        onPartial: (partialResults) => {
          setResults(partialResults);
        },
      });
      setFetchStages((prev) => prev.map((s) =>
        s.id === "diff-structural" || s.id === "diff-fuzzy" || s.id === "deref"
          ? { ...s, status: "complete" }
          : s,
      ));
      // Final enriched results — replaces partial set in place.
      setResults(workerResults);
      // Capture scroll before replacing textarea content so the user
      // doesn't lose their navigation context, then restore after React
      // commits. JSON.stringify is deferred to a microtask so the diff
      // results paint first (see handleCompare for the same pattern).
      const leftScroll = leftEditorRef.current?.scrollTop ?? 0;
      const rightScroll = rightEditorRef.current?.scrollTop ?? 0;
      setTimeout(() => {
        setBefore(JSON.stringify(oldResolved, null, 2));
        setAfter(JSON.stringify(newResolved, null, 2));
        requestAnimationFrame(() => {
          if (leftEditorRef.current) leftEditorRef.current.scrollTop = leftScroll;
          if (rightEditorRef.current) rightEditorRef.current.scrollTop = rightScroll;
        });
      }, 0);
    } catch (e) {
      if (e?.message === "cancelled") return;
      setError(e.message);
      setFetchStages((prev) => prev.map((s) =>
        s.status === "in-progress" ? { ...s, status: "error", error: e.message } : s,
      ));
    } finally {
      setResolving(false);
    }
  };

  const handleReset = () => {
    // Terminate any in-flight diff so its result can't land after Reset and
    // overwrite the cleared state. cancelDiff() rejects pending promises
    // with Error("cancelled"); the catch sites below filter those out so
    // the user doesn't see a "compare failed" toast for their own action.
    cancelDiff();
    setBefore("");
    setAfter("");
    setResults(null);
    setGuide(null);
    setActiveFilter("all");
    setError(null);
    setRefsResolved(null);
    setResolving(false);
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

  const focusEditor = (ref) => {
    const el = ref?.current;
    if (!el) return;
    // Editor ref may be a container with an internal textarea/contentEditable,
    // or a focusable element itself. Prefer the focusable child if present.
    const inner = el.querySelector?.("textarea, [contenteditable='true']");
    (inner || el).focus?.();
  };

  useKeyboardShortcuts({
    "mod+enter": () => { if (canCompare && !resolving) handleCompare(); },
    "mod+k": () => focusEditor(leftEditorRef),
    "mod+shift+k": () => focusEditor(rightEditorRef),
    "escape": () => { if (helpOpen) setHelpOpen(false); else setError(null); },
    "?": () => setHelpOpen(true),
  });

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

              {/* Keyboard shortcuts help */}
              <button
                onClick={() => setHelpOpen(true)}
                aria-label="Keyboard shortcuts"
                className="p-1.5 rounded-md text-xs bg-secondary text-muted-foreground hover:text-foreground hover:shadow-e2 hover:-translate-y-px transition-all duration-fast ease-standard"
                title="Keyboard shortcuts (?)"
              >
                <HelpCircle className="w-3.5 h-3.5" />
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

      {/* Fetch progress banner */}
      <FetchProgress
        stages={fetchStages}
        accentColor={selectedIntegration?.color ?? "hsl(var(--primary))"}
        onDismiss={() => setFetchStages([])}
      />

      {/* Sidebar + Main */}
      <div className="flex flex-1 overflow-hidden">
        <IntegrationList
          selected={selectedIntegration}
          onSelect={setSelectedIntegration}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <main className="flex-1 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            {/* ═══ COMPARE TAB ═══ */}
            {activeTab === "compare" && (
              <motion.div
                key="compare"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col flex-1 min-h-0"
              >
                {/* Fixed zone: notices + spec inputs (do not scroll with analysis) */}
                <div className="shrink-0 px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6">
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
                    onProgress={setFetchStages}
                  />
                )}

                {/* Input panels */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
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
                </div>
                {/* End fixed zone */}

                {/* Scroll zone: analysis + guide form + empty state */}
                <div className="flex-1 overflow-y-auto min-h-0 px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-4 sm:pb-6">
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
                </div>
                {/* End scroll zone */}
              </motion.div>
            )}

            {/* ═══ GUIDE TAB ═══ */}
            {activeTab === "guide" && guide && (
              <motion.div
                key="guide"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto min-h-0 px-3 sm:px-6 lg:px-8 py-4 sm:py-6"
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
      <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}