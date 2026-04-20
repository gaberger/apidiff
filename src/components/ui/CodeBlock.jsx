// Syntax-highlighted code block powered by Shiki.
// Uses codeToTokens + JSX rendering (not dangerouslySetInnerHTML) so no HTML
// sanitizer is required. Highlighter is lazily initialized once per page-load
// and memoized at the module level.

import { useEffect, useState } from "react";

let highlighterPromise = null;

async function getHighlighter() {
  if (highlighterPromise) return highlighterPromise;
  highlighterPromise = (async () => {
    const [{ createHighlighterCore }, { createOnigurumaEngine }, json, yaml, theme] =
      await Promise.all([
        import("shiki/core"),
        import("shiki/engine/oniguruma"),
        import("shiki/langs/json.mjs"),
        import("shiki/langs/yaml.mjs"),
        import("shiki/themes/github-dark.mjs"),
      ]);
    return createHighlighterCore({
      themes: [theme.default],
      langs: [json.default, yaml.default],
      engine: await createOnigurumaEngine(import("shiki/wasm")),
    });
  })();
  return highlighterPromise;
}

export default function CodeBlock({ code, lang, maxHeight = "32rem", className = "" }) {
  const [state, setState] = useState(null); // { lines, fg, bg }

  useEffect(() => {
    let cancelled = false;
    getHighlighter().then((hl) => {
      if (cancelled) return;
      try {
        const tokens = hl.codeToTokens(code, { lang, theme: "github-dark" });
        setState({
          lines: tokens.tokens,
          fg: tokens.fg,
          bg: tokens.bg,
        });
      } catch {
        setState(null);
      }
    });
    return () => { cancelled = true; };
  }, [code, lang]);

  const sharedStyle = { maxHeight };
  const sharedClass = `rounded-lg overflow-auto text-[11px] leading-relaxed font-mono ${className}`;

  if (!state) {
    return (
      <pre className={`${sharedClass} bg-stone-900 text-stone-100 p-4`} style={sharedStyle}>
        {code}
      </pre>
    );
  }

  return (
    <pre
      className={`${sharedClass} p-4`}
      style={{ ...sharedStyle, background: state.bg, color: state.fg }}
    >
      <code>
        {state.lines.map((line, i) => (
          <span key={i} style={{ display: "block" }}>
            {line.length === 0 ? "\n" : line.map((tok, j) => (
              <span key={j} style={{ color: tok.color }}>{tok.content}</span>
            ))}
          </span>
        ))}
      </code>
    </pre>
  );
}
