import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X } from "lucide-react";

export default function SpecInput({ label, value, onChange, badge, badgeColor }) {
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result);
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide uppercase"
            style={{
              backgroundColor: `hsl(var(--diff-${badgeColor}-bg))`,
              color: `hsl(var(--diff-${badgeColor}))`
            }}
          >
            {badge}
          </span>
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
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
            className="h-7 px-2.5 text-muted-foreground"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Upload
          </Button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Paste your ${badge.toLowerCase()} API spec here...\n\nSupports OpenAPI 3.x / Swagger 2.0\nJSON or YAML format`}
          className="w-full h-full min-h-[280px] resize-none rounded-lg border border-border bg-card p-4 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40 transition-all"
          spellCheck={false}
        />
        {value && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
            <FileText className="w-3 h-3" />
            {value.split("\n").length} lines
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.yaml,.yml"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}