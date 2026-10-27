// Header for the static spec site (spec.html). Shared by the Changeset Spec
// and Tools pages so both carry the same navigation.
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Github } from "lucide-react";

import { REPO_URL } from "./install.js";

export { REPO_URL };

const PAGES = [
  { to: "/", label: "Changeset Spec", also: ["/changeset-spec"] },
  { to: "/tools", label: "Tools", also: [] },
  { to: "/testing", label: "Testing", also: [] },
];

export default function SiteHeader({ actions = null }) {
  const { pathname } = useLocation();
  return (
    <header className="border-b border-border bg-white/80 backdrop-blur-sm sticky top-0 z-20">
      <div className="px-4 sm:px-8 flex items-center justify-between h-14 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="text-sm font-bold tracking-tight whitespace-nowrap">
            <span className="text-foreground">api</span>
            <span className="bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">diff</span>
          </Link>
          <nav className="ml-2 sm:ml-6 flex items-center gap-1">
            {PAGES.map(({ to, label, also }) => {
              const active = pathname === to || also.includes(pathname);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? "text-foreground bg-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <span className="hidden md:inline text-[11px] font-mono text-muted-foreground/70 px-1.5 py-0.5 bg-secondary rounded ml-2">Spec v0.2</span>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <a
            href={REPO_URL}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary text-foreground hover:bg-accent transition-colors"
            aria-label="apidiff on GitHub"
          >
            <Github className="w-3.5 h-3.5" /> <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </div>
    </header>
  );
}
