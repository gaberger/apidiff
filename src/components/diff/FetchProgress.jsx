import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, AlertCircle, Zap } from "lucide-react";

export default function FetchProgress({ stages, accentColor = "hsl(var(--primary))", onDismiss }) {
  const [visible, setVisible] = useState(false);

  const hasActive = stages.some((s) => s.status === "in-progress");
  const allDone = stages.length > 0 && stages.every((s) => s.status === "complete");
  const hasError = stages.some((s) => s.status === "error");
  const anyCacheHit = stages.some((s) => s.cacheHit);

  useEffect(() => {
    if (stages.length > 0 && (hasActive || hasError || allDone)) {
      setVisible(true);
    }
  }, [stages.length, hasActive, hasError, allDone]);

  useEffect(() => {
    if (allDone && !hasError) {
      const t = setTimeout(() => {
        setVisible(false);
        onDismiss?.();
      }, anyCacheHit ? 600 : 1200);
      return () => clearTimeout(t);
    }
  }, [allDone, hasError, anyCacheHit, onDismiss]);

  const percent = useMemo(() => {
    if (stages.length === 0) return 0;
    const completed = stages.filter((s) => s.status === "complete").length;
    const partial = stages.some((s) => s.status === "in-progress") ? 0.5 : 0;
    return Math.min(100, Math.round(((completed + partial) / stages.length) * 100));
  }, [stages]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-14 z-10 border-b border-border bg-background/85 backdrop-blur-xl shadow-e1 transition-all duration-base ease-standard"
    >
      <div className="px-3 sm:px-6 lg:px-8 py-2.5">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <div className="flex items-center gap-2 text-xs">
            {hasError ? (
              <AlertCircle className="w-3.5 h-3.5 text-destructive" />
            ) : anyCacheHit && allDone ? (
              <Zap className="w-3.5 h-3.5" style={{ color: accentColor }} />
            ) : (
              <Loader2 className={`w-3.5 h-3.5 ${hasActive ? "animate-spin" : ""}`} style={{ color: accentColor }} />
            )}
            <span className="font-semibold text-foreground">
              {hasError ? "Fetch failed" : anyCacheHit && allDone ? "Loaded from cache" : hasActive ? "Loading specs…" : allDone ? "Ready" : "Preparing…"}
            </span>
            <span className="t-meta">{percent}%</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground overflow-x-auto">
            {stages.map((s) => (
              <StagePill key={s.id} stage={s} accentColor={accentColor} />
            ))}
          </div>
        </div>
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="absolute inset-y-0 left-0 transition-all duration-base ease-standard"
            style={{
              width: `${percent}%`,
              background: hasError
                ? "hsl(var(--destructive))"
                : `linear-gradient(90deg, ${accentColor}, ${accentColor}cc)`,
            }}
          />
          {hasActive && !hasError && (
            <div
              className="absolute inset-y-0 w-1/4 animate-pulse"
              style={{
                left: `${Math.max(0, percent - 15)}%`,
                background: `linear-gradient(90deg, transparent, ${accentColor}55, transparent)`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StagePill({ stage, accentColor }) {
  const { label, status, cacheHit } = stage;
  const Icon = status === "complete"
    ? CheckCircle2
    : status === "error"
    ? AlertCircle
    : status === "in-progress"
    ? Loader2
    : null;

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap transition-colors duration-fast ease-standard ${
        status === "complete" ? "text-foreground" :
        status === "in-progress" ? "font-semibold" :
        status === "error" ? "text-destructive" :
        "text-muted-foreground/60"
      }`}
      style={status === "in-progress" ? { color: accentColor } : undefined}
    >
      {Icon && (
        <Icon className={`w-3 h-3 ${status === "in-progress" ? "animate-spin" : ""}`} />
      )}
      <span>{label}{cacheHit ? " (cached)" : ""}</span>
    </span>
  );
}
