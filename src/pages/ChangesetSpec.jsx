import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Download, FileJson, FileCode } from "lucide-react";
import CodeBlock from "@/components/ui/CodeBlock";
import schemaJson from "../../apidiffspec/api-changeset-schema.json?raw";
import exampleYaml from "../../apidiffspec/example-changeset.yaml?raw";

const FAMILIES = [
  {
    name: "Structural",
    color: "#0EA5E9",
    blurb: "Reshape the API. Detectable by spec diff.",
    ops: ["add", "remove", "rename", "move", "split", "merge", "replace", "recompose"],
  },
  {
    name: "Constraint",
    color: "#8B5CF6",
    blurb: "Change validation or encoding rules. Detectable by spec diff.",
    ops: ["tighten", "loosen", "constrain", "retype", "redefault", "recode"],
  },
  {
    name: "Semantic",
    color: "#F59E0B",
    blurb: "Change meaning without changing shape. Author-only, invisible to spec diff.",
    ops: ["resemanticize", "reorder", "retime", "annotate"],
  },
  {
    name: "Lifecycle",
    color: "#10B981",
    blurb: "Change availability. Detectable by spec diff (deprecated flag, removal).",
    ops: ["deprecate", "sunset", "restore", "withdraw"],
  },
];

const TARGET_KINDS = [
  "endpoint", "operation",
  "path-parameter", "query-parameter", "header-parameter", "cookie-parameter",
  "request-body", "request-field",
  "response", "response-field", "response-header", "status-code",
  "schema", "schema-field", "enum-value",
  "security-scheme", "content-type", "server",
  "rate-limit", "auth",
  "webhook", "callback",
  "example", "discriminator", "link", "tag",
];

const QUESTIONS = [
  {
    q: "Granularity of op: collapse split/merge into rename+multi-target, or keep them as first-class?",
    a: "First-class. Humans read split/merge faster than 'rename with N targets'; tools can still derive the simpler form from either. The schema keeps split, merge, rename, move, replace, recompose as distinct ops.",
  },
  {
    q: "Semantic changes (resemanticize, retime, reorder, annotate) can't be diffed from the specs — how do tools know?",
    a: "Each change may set detectable: false. Semantic-family ops default to false; structural/constraint ops default to true. Validators treat a missing diff entry as suspicious only when detectable is true.",
  },
  {
    q: "Grouping: if a field rename affects 12 endpoints, is that one entry with 12 targets, or 12 linked entries?",
    a: "One entry. The from / to fields accept a JSON Pointer OR an array of pointers. Use a pointer array for one logical change mirrored at N coordinated locations. Reserve the related and supersedes arrays for true multi-change migrations across releases.",
  },
  {
    q: "Aggregation vs atomicity: one document per release, or per-change files that get aggregated?",
    a: "Both are supported. Per-file changesets are friendlier to git workflows — no merge conflicts on a shared changelog. Aggregated is friendlier for consumption. Consumers should be liberal in what they accept.",
  },
];

const GAPS_FILLED = [
  { label: "constrain", note: "Orthogonal rule change — neither stricter nor looser (e.g., swapping email → uri format)." },
  { label: "annotate", note: "Documentation-only clarification with no wire-format change." },
  { label: "recompose", note: "Schema composition reshuffled (allOf/oneOf/anyOf) without semantic change." },
  { label: "example / discriminator / link / tag targets", note: "Target kinds that were missing in v0.1." },
  { label: "severity: info | notice | breaking", note: "Richer than a boolean. A new required response field may be non-breaking but still warrant attention (notice). A cosmetic rename is info. Only 'breaking' forces a migration block." },
  { label: "cross-changeset supersedes / related", note: "Entries may reference IDs in other changeset documents via { changeset, id, url } objects, not just bare string IDs." },
  { label: "detectable: boolean", note: "Author-settable flag describing whether a spec-diff tool should expect to find evidence of this change by comparing the two OpenAPI documents." },
];

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ChangesetSpec() {
  const { pathname } = useLocation();
  const navItem = (to, label) => (
    <Link
      to={to}
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
        pathname === to
          ? "text-stone-900 bg-stone-200"
          : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="px-4 sm:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-sm font-bold tracking-tight whitespace-nowrap">
              <span className="text-stone-800">api</span>
              <span className="bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">diff</span>
            </h1>
            <nav className="ml-2 sm:ml-6 flex items-center gap-1">
              {navItem("/", "Compare")}
              {navItem("/changeset-spec", "Changeset Spec")}
              {navItem("/settings", "Settings")}
            </nav>
            <span className="hidden sm:inline text-[11px] font-mono text-stone-400 px-1.5 py-0.5 bg-stone-100 rounded ml-2">Spec v0.2</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadBlob(schemaJson, "api-changeset-schema.json", "application/json")}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors"
            >
              <FileJson className="w-3.5 h-3.5" /> Schema
            </button>
            <button
              onClick={() => downloadBlob(exampleYaml, "example-changeset.yaml", "application/yaml")}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors"
            >
              <FileCode className="w-3.5 h-3.5" /> Example
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-8 py-10 space-y-10 text-stone-700">

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-stone-900">What is a Changeset?</h2>
          <p className="leading-relaxed">
            A <strong>changeset</strong> is a structured document describing <em>how we got from OpenAPI spec A to spec B</em>.
            It is both human-readable and machine-parseable, and validates against a JSON Schema (Draft 2020-12).
          </p>
          <p className="leading-relaxed">
            Each entry has an operation, a target, JSON Pointers into the affected spec locations, an optional migration block,
            and metadata like severity and rationale. A single document describes one API-version transition.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-stone-900">Why this format exists alongside the specs</h2>
          <p className="leading-relaxed">
            You can diff two OpenAPI documents with a tool like <code className="text-xs px-1 py-0.5 bg-stone-100 rounded">oasdiff</code> and
            recover most structural and constraint changes automatically. But some classes of change are <strong>invisible to spec diff</strong>:
          </p>
          <ul className="list-disc pl-5 space-y-1 leading-relaxed">
            <li><code className="text-xs px-1 py-0.5 bg-stone-100 rounded">resemanticize</code> — same shape, new meaning (<code>pending</code> used to mean "not yet paid"; it now means "paid, awaiting fulfillment").</li>
            <li><code className="text-xs px-1 py-0.5 bg-stone-100 rounded">retime</code> — timing/consistency semantics shift (read-your-writes → eventually consistent).</li>
            <li><code className="text-xs px-1 py-0.5 bg-stone-100 rounded">reorder</code> — ordering guarantees change.</li>
            <li><code className="text-xs px-1 py-0.5 bg-stone-100 rounded">annotate</code> — pure documentation clarifications with no wire-format change.</li>
          </ul>
          <p className="leading-relaxed">
            These are <strong>author-only</strong> operations. A changeset document is the only place they can live.
            That is the primary reason this format needs to exist alongside the specs rather than being derived from them.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-stone-900">Operation families</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {FAMILIES.map((f) => (
              <div
                key={f.name}
                className="border border-stone-200 rounded-lg bg-white p-4"
                style={{ borderLeft: `3px solid ${f.color}` }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-sm font-semibold text-stone-800">{f.name}</h3>
                </div>
                <p className="text-xs text-stone-500 mb-3 leading-relaxed">{f.blurb}</p>
                <div className="flex flex-wrap gap-1.5">
                  {f.ops.map((op) => (
                    <span
                      key={op}
                      className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-stone-100 text-stone-700"
                    >
                      {op}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-stone-900">Target kinds</h2>
          <p className="leading-relaxed text-sm">
            Orthogonal to the operation. Answers <em>what kind of thing is being operated on</em>.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TARGET_KINDS.map((t) => (
              <span
                key={t}
                className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-white border border-stone-200 text-stone-600"
              >
                {t}
              </span>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-stone-900">Open questions, resolved</h2>
          <div className="space-y-4">
            {QUESTIONS.map((item, i) => (
              <div key={i} className="border-l-2 border-amber-300 pl-4 py-1">
                <p className="text-sm font-semibold text-stone-800 mb-1">{item.q}</p>
                <p className="text-sm leading-relaxed text-stone-600">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-stone-900">Gaps filled in v0.2</h2>
          <ul className="space-y-2">
            {GAPS_FILLED.map((g) => (
              <li key={g.label} className="text-sm leading-relaxed">
                <code className="text-xs font-mono px-1.5 py-0.5 bg-stone-100 rounded text-stone-800">{g.label}</code>
                <span className="ml-2 text-stone-600">— {g.note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-stone-900">Example</h2>
          <p className="text-sm leading-relaxed text-stone-600">
            A full example exercising all four families, multi-target renames, cross-changeset supersedes, severity, and <code className="text-xs px-1 py-0.5 bg-stone-100 rounded">detectable: false</code> on semantic ops.
          </p>
          <CodeBlock code={exampleYaml} lang="yaml" />
          <button
            onClick={() => downloadBlob(exampleYaml, "example-changeset.yaml", "application/yaml")}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download example
          </button>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-stone-900">Schema</h2>
          <p className="text-sm leading-relaxed text-stone-600">
            Draft 2020-12 JSON Schema. Use any standard validator to check a changeset document.
          </p>
          <CodeBlock code={schemaJson} lang="json" />
          <button
            onClick={() => downloadBlob(schemaJson, "api-changeset-schema.json", "application/json")}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download schema
          </button>
        </section>

      </main>
    </div>
  );
}
