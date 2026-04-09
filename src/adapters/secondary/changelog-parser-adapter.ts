// Changelog parser adapter — extracts version identifiers from changelog pages
// May only import from ports/ (never other adapters)

import type { ChangelogParserPort } from "../../core/ports/index.js";

const VERSION_PATTERNS = [
  /##\s+\[?(v?\d+\.\d+[\.\d]*)\]?/g,       // Markdown headings: ## [v1.2.3] or ## v1.2.3
  /\bversion\s+(v?\d+\.\d+[\.\d]*)\b/gi,    // "version 1.2.3"
  /\brelease\s+(v?\d+\.\d+[\.\d]*)\b/gi,    // "release 1.2.3"
  /\b(v\d+\.\d+[\.\d]*)\b/g,                // Bare version tags: v1.2.3
];

const MAX_VERSIONS = 50;

export class ChangelogParserAdapter implements ChangelogParserPort {
  async parse(url: string): Promise<string[]> {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "apidiff-discovery/2.0",
        Accept: "text/html,text/plain,text/markdown,*/*",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return [];

    const text = await res.text();
    const found = new Set<string>();

    for (const pattern of VERSION_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        found.add(match[1]);
        if (found.size >= MAX_VERSIONS) break;
      }
      if (found.size >= MAX_VERSIONS) break;
    }

    return Array.from(found);
  }
}
