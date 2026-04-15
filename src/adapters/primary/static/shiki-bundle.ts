import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import json from 'shiki/langs/json.mjs';
import rosePineDawn from 'shiki/themes/rose-pine-dawn.mjs';

export async function createJsonHighlighter() {
  // Use the WASM-backed oniguruma engine instead of the JS regex engine.
  // Oniguruma is 3–5× faster on large files, reducing syntax-highlight stall
  // time under requestIdleCallback for specs >2k lines (B7 fix).
  return createHighlighterCore({
    themes: [rosePineDawn],
    langs: [json],
    engine: await createOnigurumaEngine(import('shiki/wasm')),
  });
}
