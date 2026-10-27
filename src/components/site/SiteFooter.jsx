// Footer for every page of the static spec site: the install command, so it
// is one copy away wherever a reader lands.
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy } from "lucide-react";
import { INSTALL_CMD, REPO_URL, LATEST_RELEASE_URL } from "./install.js";

export default function SiteFooter() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the command stays selectable on the page.
    }
  };
  return (
    <footer className="border-t border-border bg-white/60">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-3 text-sm">
        <p className="font-medium text-foreground">Install apidiff on macOS or Linux</p>
        <div className="flex items-stretch rounded-lg overflow-hidden" style={{ background: "#24292e" }}>
          <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap px-4 py-2.5 text-[12px] font-mono" style={{ color: "#f0f6fc" }}>
            <span style={{ color: "#6a737d" }}>$ </span>{INSTALL_CMD}
          </code>
          <button
            onClick={copy}
            className="px-3 text-xs inline-flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Copy install command"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          <Link to="/tools#install" className="underline underline-offset-2">Other ways to install</Link>, including
          Windows and pinning a version. Source on <a href={REPO_URL} className="underline underline-offset-2">GitHub</a>,
          binaries in the <a href={LATEST_RELEASE_URL} className="underline underline-offset-2">latest release</a>.
        </p>
      </div>
    </footer>
  );
}
