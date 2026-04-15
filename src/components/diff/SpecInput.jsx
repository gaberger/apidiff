import React, { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, Globe, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useDiffHighlight } from "@/hooks/use-diff-highlight";

/**
 * Format byte size to human-readable string.
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

/**
 * Try to extract a version string from raw JSON/YAML text.
 * Looks for info.version, openapi, or swagger fields.
 */
function extractVersion(text) {
  if (!text) return null;
  try {
    // Try info.version first
    const infoVersion = text.match(/"version"\s*:\s*"([^"]+)"/);
    if (infoVersion) return infoVersion[1];
    // Try openapi field
    const openapi = text.match(/"openapi"\s*:\s*"([^"]+)"/);
    if (openapi) return "OpenAPI " + openapi[1];
    // Try swagger field
    const swagger = text.match(/"swagger"\s*:\s*"([^"]+)"/);
    if (swagger) return "Swagger " + swagger[1];
    // YAML variants
    const yamlVersion = text.match(/^version:\s*['"]?([^\s'"]+)/m);
    if (yamlVersion) return yamlVersion[1];
    const yamlOpenapi = text.match(/^openapi:\s*['"]?([^\s'"]+)/m);
    if (yamlOpenapi) return "OpenAPI " + yamlOpenapi[1];
    const yamlSwagger = text.match(/^swagger:\s*['"]?([^\s'"]+)/m);
    if (yamlSwagger) return "Swagger " + yamlSwagger[1];
  } catch {
    // ignore
  }
  return null;
}

/** Safe JSON syntax colorizer — returns React elements, no innerHTML (ADR-004) */
function colorizeJsonLine(line) {
  const tokens = [];
  let rest = line;
  let key = 0;

  // Special rendering for __$ref annotation lines
  if (line.includes('"__$ref"')) {
    const indent = line.match(/^(\s*)/)?.[1] || "";
    const refVal = line.match(/"__\$ref"\s*:\s*"([^"]+)"/)?.[1] || "";
    return [
      <span key="indent">{indent}</span>,
      <span key="ref" className="text-blue-500 italic text-[11px]">{"/* $ref: " + refVal + " */"}</span>
    ];
  }

  // Match leading whitespace
  const indentMatch = rest.match(/^(\s*)/);
  if (indentMatch && indentMatch[1]) {
    tokens.push(<span key={key++}>{indentMatch[1]}</span>);
    rest = rest.slice(indentMatch[1].length);
  }

  // Match "key": pattern
  const keyMatch = rest.match(/^("(?:[^"\\]|\\.)*")\s*:/);
  if (keyMatch) {
    tokens.push(<span key={key++} className="text-purple-700">{keyMatch[1]}</span>);
    tokens.push(<span key={key++}>: </span>);
    rest = rest.slice(keyMatch[0].length).replace(/^\s*/, "");

    // Match value
    if (rest.startsWith('"')) {
      const valMatch = rest.match(/^("(?:[^"\\]|\\.)*")(.*)/);
      if (valMatch) {
        tokens.push(<span key={key++} className="text-green-700">{valMatch[1]}</span>);
        tokens.push(<span key={key++}>{valMatch[2]}</span>);
        return tokens;
      }
    } else if (/^(true|false)/.test(rest)) {
      const boolMatch = rest.match(/^(true|false)(.*)/);
      tokens.push(<span key={key++} className="text-amber-700">{boolMatch[1]}</span>);
      tokens.push(<span key={key++}>{boolMatch[2]}</span>);
      return tokens;
    } else if (/^null/.test(rest)) {
      const nullMatch = rest.match(/^(null)(.*)/);
      tokens.push(<span key={key++} className="text-stone-400">{nullMatch[1]}</span>);
      tokens.push(<span key={key++}>{nullMatch[2]}</span>);
      return tokens;
    } else if (/^-?\d/.test(rest)) {
      const numMatch = rest.match(/^(-?\d+\.?\d*)(.*)/);
      tokens.push(<span key={key++} className="text-blue-700">{numMatch[1]}</span>);
      tokens.push(<span key={key++}>{numMatch[2]}</span>);
      return tokens;
    }
  }

  // Fallback — plain text
  tokens.push(<span key={key++} className="text-stone-700">{rest}</span>);
  return tokens;
}

const SpecInputRaw = React.memo(function SpecInput({
  label,
  value,
  onChange,
  badge,
  badgeColor,
  results,
  textareaRef,
  highlightLine,
  loading = false,
}) {
  const fileRef = useRef(null);
  const lineGutterRef = useRef(null);
  const internalTextareaRef = useRef(null);
  const taRef = textareaRef || internalTextareaRef;

  const preRef = useRef(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [fetchUrl, setFetchUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState("");
  const [activeHighlight, setActiveHighlight] = useState(null);
  const [highlightedLines, setHighlightedLines] = useState(null);

  // Track active highlight line (no timeout — stays until new click)
  useEffect(() => {
    if (highlightLine == null) return;
    setActiveHighlight(highlightLine);
  }, [highlightLine]);

  // Diff-aware line highlighting
  const diffHighlightMap = useDiffHighlight(value, results);

  // Deferred colorization: for large specs (>2k lines) skip the pre overlay entirely —
  // the raw textarea already shows the content and is instantly scrollable. Colorize
  // in background for smaller specs; large specs show unstyled text.
  const LARGE_LINE_COUNT = 2000;
  const lines = useMemo(() => value ? value.split("\n") : [], [value]);

  useEffect(() => {
    if (!value) { setHighlightedLines(null); return; }

    // Large spec: skip pre overlay entirely — textarea shows raw content, user can
    // scroll immediately. Zero React element creation on the main thread.
    if (lines.length > LARGE_LINE_COUNT) {
      setHighlightedLines(null);
      return;
    }

    // Small spec: render plain text immediately.
    const plainLines = lines.map((line, i) => (
      <div key={i} style={{ display: "block", minWidth: "100%" }}>{line}</div>
    ));
    setHighlightedLines(plainLines);

    // Then colorize in background.
    const id = requestIdleCallback(() => {
      const diffBgColors = {
        removed: "bg-red-50 dark:bg-red-900/30",
        added: "bg-green-50 dark:bg-green-900/30",
        renamed: "bg-purple-50 dark:bg-purple-900/30",
        moved: "bg-blue-50 dark:bg-blue-900/30",
        "type-change": "bg-amber-50 dark:bg-amber-900/30",
        changed: "bg-amber-50 dark:bg-amber-900/30",
      };
      const colored = lines.map((line, i) => {
        const diffInfo = diffHighlightMap?.get(i);
        const bgClass = diffInfo ? diffBgColors[diffInfo.type] || "" : "";
        const isActive = activeHighlight === i;
        const style = isActive
          ? { backgroundColor: "rgba(251,191,36,0.5)", borderTop: "1px solid rgba(245,158,11,0.7)", borderBottom: "1px solid rgba(245,158,11,0.7)", display: "block", minWidth: "100%" }
          : { display: "block", minWidth: "100%" };
        return (
          <div key={i} className={bgClass} style={style}>
            {colorizeJsonLine(line)}
          </div>
        );
      });
      setHighlightedLines(colored);
    }, { timeout: 2000 });

    return () => cancelIdleCallback(id);
  }, [value, lines, diffHighlightMap, activeHighlight]);

  // Drag counter to handle nested drag events
  const dragCounter = useRef(0);

  // ── File handling (upload button) ──
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFileAndPopulate(file);
    e.target.value = "";
  };

  // ── Read file content and populate textarea ──
  const readFileAndPopulate = useCallback(
    (file) => {
      setError("");
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const content = reader.result;
          // Try to parse and pretty-print JSON
          try {
            const parsed = JSON.parse(content);
            onChange(JSON.stringify(parsed, null, 2));
          } catch {
            // Not JSON — use raw content (YAML or other)
            onChange(content);
          }
        } catch (ex) {
          setError("Failed to read file: " + ex.message);
        }
      };
      reader.onerror = () => setError("Failed to read file");
      reader.readAsText(file);
    },
    [onChange]
  );

  // ── Drag and drop handlers ──
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragOver(false);
      setError("");

      const file = e.dataTransfer?.files?.[0];
      if (!file) return;

      const validExts = [".json", ".yaml", ".yml"];
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!validExts.includes(ext)) {
        setError("Unsupported file type. Please drop a .json, .yaml, or .yml file.");
        return;
      }

      readFileAndPopulate(file);
    },
    [readFileAndPopulate]
  );

  // ── URL fetch handler ──
  const handleFetch = useCallback(async () => {
    const url = fetchUrl.trim();
    if (!url) return;

    setError("");
    setIsFetching(true);

    try {
      const res = await base44.functions.invoke('proxyFetch', { url });
      const data = res.data;
      if (data.error) throw new Error(data.error);
      onChange(JSON.stringify(data.document, null, 2));
    } catch (ex) {
      setError("Fetch failed: " + (ex.response?.data?.error || ex.message));
    } finally {
      setIsFetching(false);
    }
  }, [fetchUrl, onChange]);

  const lineCount = lines.length || 1;

  // Sync gutter + pre overlay scroll with textarea scroll
  const handleScroll = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (lineGutterRef.current) lineGutterRef.current.scrollTop = ta.scrollTop;
    if (preRef.current) preRef.current.scrollTop = ta.scrollTop;
  }, [taRef]);

  // ── Editor info ──
  const editorInfo = useMemo(() => {
    if (!value) return null;
    const size = new Blob([value]).size;
    const version = extractVersion(value);
    const lineNum = value.split("\n").length;
    return { lines: lineNum, size: formatSize(size), version };
  }, [value]);

  return (
    <div className="flex flex-col h-full">
      {/* Header row: badge + label + actions */}
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide uppercase"
            style={{
              backgroundColor: `hsl(var(--diff-${badgeColor}-bg))`,
              color: `hsl(var(--diff-${badgeColor}))`,
            }}
          >
            {badge}
          </span>
          <span className="text-xs sm:text-sm font-medium text-foreground truncate">{label}</span>
          {editorInfo?.version && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold font-mono bg-amber-50 text-amber-700 border border-amber-200">
              {editorInfo.version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          {value && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-destructive"
              onClick={() => onChange("")}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 sm:px-2.5 text-muted-foreground"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Upload</span>
          </Button>
        </div>
      </div>

      {/* Editor area with drop zone */}
      <div
        className="relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drop overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-amber-50/90 border-2 border-dashed border-amber-400 pointer-events-none">
            <span className="text-sm font-semibold text-amber-700">
              Drop OpenAPI spec file here
            </span>
          </div>
        )}

        {/* Line numbers + textarea wrapper */}
        <div className="relative flex w-full h-[520px] rounded-xl border border-border bg-card shadow-e2 overflow-hidden focus-within:shadow-e3 focus-within:ring-2 focus-within:ring-ring/20 focus-within:border-ring/40 transition-all duration-base ease-standard">
          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Computing…</span>
            </div>
          )}

          {/* Line number gutter */}
          <div
            ref={lineGutterRef}
            className="flex-shrink-0 w-10 bg-stone-100 dark:bg-stone-900 border-r border-stone-200 dark:border-stone-700 overflow-hidden select-none"
            aria-hidden="true"
          >
            <div className="py-2 sm:py-3 pr-2 text-right font-mono text-[10px] sm:text-[11px] leading-[1.6] text-stone-400">
              {Array.from({ length: Math.max(lineCount, 1) }, (_, i) => (
                <div key={i + 1}>{i + 1}</div>
              ))}
            </div>
          </div>

          {/* Editor area: textarea visible for input, pre overlay for syntax colors */}
          <div className="flex-1 relative">
            {/* Syntax-highlighted + diff-colored pre (behind textarea) */}
            <pre
              ref={preRef}
              className="absolute inset-0 py-2 sm:py-3 px-2 sm:px-3 font-mono text-[11px] sm:text-[13px] leading-[1.6] whitespace-pre overflow-auto pointer-events-none m-0 z-0"
              aria-hidden="true"
            >
              <div style={{minWidth: "max-content"}}>{highlightedLines}</div>
            </pre>

            {/* Textarea on top — transparent text, visible caret */}
            <textarea
              ref={taRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onScroll={handleScroll}
              placeholder={`Paste JSON, drop a file, or fetch from URL...\n\nSupports OpenAPI 3.x / Swagger 2.0\nJSON or YAML format`}
              className="relative z-10 w-full h-full resize-none bg-transparent py-2 sm:py-3 px-2 sm:px-3 font-mono text-[11px] sm:text-[13px] leading-[1.6] text-transparent caret-stone-800 dark:caret-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none"
              style={{ caretColor: "#1c1917", WebkitTextFillColor: "transparent" }}
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      {/* Editor info bar */}
      {editorInfo && (
        <div className="flex gap-3 mt-1.5 px-1 font-mono text-[11px] text-stone-500">
          <span>{editorInfo.lines} lines</span>
          <span>{editorInfo.size}</span>
        </div>
      )}

      {/* URL fetch row */}
      <div className="flex gap-1.5 sm:gap-2 mt-2">
        <input
          type="url"
          value={fetchUrl}
          onChange={(e) => setFetchUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleFetch();
          }}
          placeholder="https://api.example.com/openapi.json"
          className="flex-1 min-w-0 font-mono text-[11px] sm:text-[13px] bg-stone-50 border border-stone-200 rounded-md px-2 sm:px-2.5 py-1.5 text-foreground placeholder:text-stone-400 outline-none focus:border-amber-400 transition-colors"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 sm:px-3 text-[11px] sm:text-[13px] font-semibold border-stone-200 hover:bg-stone-100"
          onClick={handleFetch}
          disabled={isFetching || !fetchUrl.trim()}
        >
          {isFetching ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Fetching...
            </>
          ) : (
            <>
              <Globe className="w-3.5 h-3.5 mr-1.5" />
              Fetch
            </>
          )}
        </Button>
      </div>

      {/* Error display */}
      {error && (
        <p className="mt-1 text-[13px] text-red-600">{error}</p>
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".json,.yaml,.yml"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
});

export default function SpecInput(props) {
  return <SpecInputRaw {...props} />;
}