import React, { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Check } from "lucide-react";

// ── localStorage helpers ──

function storageKey(guide) {
  return "migration-checklist-" + btoa(guide.versions.base + ":" + guide.versions.revision);
}

function loadState(guide) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(guide)) || "{}");
  } catch {
    return {};
  }
}

function saveState(guide, state) {
  localStorage.setItem(storageKey(guide), JSON.stringify(state));
}

// ── Severity styling maps ──

const BORDER_COLOR = {
  breaking: "border-l-red-500",
  deprecated: "border-l-amber-500",
  "non-breaking": "border-l-green-500",
};

const BADGE_STYLE = {
  breaking: "bg-red-50 text-red-600",
  deprecated: "bg-amber-50 text-amber-600",
  "non-breaking": "bg-green-50 text-green-600",
};

// ── Timeline Dot ──

function TimelineDot({ status }) {
  if (status === "past") {
    return <div className="w-4 h-4 rounded-full bg-stone-400 border-2 border-stone-400" />;
  }
  if (status === "current") {
    return (
      <div className="w-4 h-4 rounded-full bg-amber-500 border-2 border-amber-500 shadow-[0_0_0_4px_rgba(217,157,59,0.2)]" />
    );
  }
  // future
  return <div className="w-4 h-4 rounded-full bg-white border-2 border-stone-300" />;
}

// ── Timeline Section ──

function Timeline({ steps }) {
  return (
    <div className="relative flex items-start justify-between mb-6">
      {/* Connecting line */}
      <div className="absolute top-2 left-0 right-0 h-0.5 bg-stone-200" />

      {steps.map((step, i) => (
        <motion.div
          key={step.label}
          className="relative flex flex-col items-center text-center flex-1"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
        >
          <div className="relative z-10 mb-2">
            <TimelineDot status={step.status} />
          </div>
          <span className="text-sm font-semibold text-stone-800">{step.label}</span>
          <span className="text-xs text-stone-500 mt-0.5">{step.description}</span>
          {step.date && (
            <span className="text-xs font-semibold text-amber-600 mt-0.5">{step.date}</span>
          )}
        </motion.div>
      ))}
    </div>
  );
}

// ── Progress Bar ──

function ProgressBar({ done, total }) {
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);

  return (
    <div className="mb-6">
      <div className="text-sm font-medium text-stone-500 mb-2">
        {done} of {total} complete ({pct}%)
      </div>
      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-purple-500"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ── Code Example Tabs ──

function CodeExamples({ examples }) {
  const languages = Object.keys(examples);
  const [active, setActive] = useState(languages[0] || "node");

  if (languages.length === 0) return null;

  const current = examples[active];

  return (
    <div className="mt-3">
      {/* Language tabs */}
      <div className="flex gap-1 mb-2">
        {languages.map((lang) => (
          <button
            key={lang}
            onClick={() => setActive(lang)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              active === lang
                ? "bg-stone-800 text-white"
                : "bg-stone-100 text-stone-500 hover:bg-stone-200"
            }`}
          >
            {lang}
          </button>
        ))}
      </div>

      {/* Code blocks */}
      {current && (
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div>
            <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1">
              Before
            </div>
            <pre className="bg-stone-50 border border-stone-200 rounded-md p-3 overflow-x-auto whitespace-pre-wrap text-red-700">
              {current.before}
            </pre>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1">
              After
            </div>
            <pre className="bg-stone-50 border border-stone-200 rounded-md p-3 overflow-x-auto whitespace-pre-wrap text-green-700">
              {current.after}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Checklist Item ──

function ChecklistRow({ item, checked, onToggle }) {
  return (
    <label
      className={`flex items-center gap-3 py-1.5 cursor-pointer group ${
        checked ? "line-through text-stone-400" : "text-stone-600"
      }`}
    >
      <div
        className={`w-4 h-4 min-w-[16px] rounded border-2 flex items-center justify-center transition-all ${
          checked
            ? "bg-amber-500 border-amber-500"
            : "border-stone-300 group-hover:border-stone-400 bg-white"
        }`}
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
      >
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>
      <span className="text-sm" onClick={(e) => { e.preventDefault(); onToggle(); }}>
        {item.text}
      </span>
    </label>
  );
}

// ── Change Card ──

function ChangeCard({ change, checkState, onCheck }) {
  return (
    <motion.div
      className={`bg-white border border-stone-200 rounded-lg p-4 mb-3 border-l-4 ${BORDER_COLOR[change.severity]}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header: badge + summary */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded ${BADGE_STYLE[change.severity]}`}
        >
          {change.severity}
        </span>
        <span className="text-sm text-stone-600">{change.summary}</span>
      </div>

      {/* Code examples with language tabs */}
      <CodeExamples examples={change.codeExamples} />

      {/* Checklist */}
      {change.checklistItems.length > 0 && (
        <div className="mt-3 pt-3 border-t border-stone-100">
          {change.checklistItems.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              checked={!!checkState[item.id]}
              onToggle={() => onCheck(item.id)}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Export as Markdown ──

function exportMarkdown(guide, checkState) {
  let md = "# " + guide.title + "\n\n";
  if (guide.sunsetDate) md += "**Sunset:** " + guide.sunsetDate + "\n\n";

  md += "## Timeline\n\n";
  guide.timeline.forEach((s) => {
    md += "- **" + s.label + "** — " + s.description + (s.date ? " (" + s.date + ")" : "") + "\n";
  });

  md += "\n## Changes\n\n";
  guide.changes.forEach((ch) => {
    md += "### [" + ch.severity + "] " + ch.summary + "\n\n";
    ch.checklistItems.forEach((i) => {
      md += "- [" + (checkState[i.id] ? "x" : " ") + "] " + i.text + "\n";
    });
    md += "\n";
  });

  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "migration-" + guide.versions.base + "-to-" + guide.versions.revision + ".md";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Main Component ──

export default function MigrationGuide({ guide, onClose }) {
  const [checkState, setCheckState] = useState({});

  // Load persisted checklist state when guide changes
  useEffect(() => {
    if (guide) {
      setCheckState(loadState(guide));
    }
  }, [guide]);

  const handleCheck = useCallback(
    (itemId) => {
      setCheckState((prev) => {
        const next = { ...prev, [itemId]: !prev[itemId] };
        if (guide) saveState(guide, next);
        return next;
      });
    },
    [guide]
  );

  // Progress calculation
  const { done, total } = useMemo(() => {
    if (!guide) return { done: 0, total: 0 };
    let t = 0;
    let d = 0;
    guide.changes.forEach((ch) => {
      ch.checklistItems.forEach((item) => {
        t++;
        if (checkState[item.id]) d++;
      });
    });
    return { done: d, total: t };
  }, [guide, checkState]);

  if (!guide) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-stone-800">
              {guide.title}
            </h2>
            <p className="text-sm text-stone-500 mt-1">
              {guide.versions.base} &rarr; {guide.versions.revision}
              {guide.sunsetDate && (
                <span className="ml-2 text-amber-600 font-semibold">
                  &middot; Sunset: {guide.sunsetDate}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
            aria-label="Close migration guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Timeline ── */}
        <section>
          <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            Timeline
          </h3>
          <Timeline steps={guide.timeline} />
        </section>

        {/* ── Progress ── */}
        <section>
          <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            Progress
          </h3>
          <ProgressBar done={done} total={total} />
        </section>

        {/* ── Changes ── */}
        <section>
          <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            Changes
          </h3>
          {guide.changes.length === 0 ? (
            <p className="text-sm text-stone-400">No changes — nothing to migrate.</p>
          ) : (
            guide.changes.map((change, i) => (
              <ChangeCard
                key={change.diffResult.path + "-" + i}
                change={change}
                checkState={checkState}
                onCheck={handleCheck}
              />
            ))
          )}
        </section>

        {/* ── Export ── */}
        <div className="pt-2">
          <button
            onClick={() => exportMarkdown(guide, checkState)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 hover:border-stone-300 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export as Markdown
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
