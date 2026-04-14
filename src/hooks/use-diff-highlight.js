import { useMemo } from "react";

// Above this line count, the "walk-down" scan (was O(lines × changedPaths))
// dominates load time. Exact + walk-up matching still runs — that covers the
// lines where changed values actually live; only the container-highlighting
// polish is dropped for huge specs.
const WALK_DOWN_LIMIT_LINES = 5000;

/**
 * Maps diff results to line numbers in a JSON string.
 *
 * @param {string} jsonString - pretty-printed JSON text
 * @param {Array<{ path: string, newPath?: string, type: string }>} results - diff results
 * @returns {Map<number, { type: string, path: string }>} line number -> change info
 */
export function useDiffHighlight(jsonString, results) {
  return useMemo(() => {
    const highlights = new Map();
    if (!jsonString) return highlights;

    const linePathMap = buildLinePathMap(jsonString);
    const lineCount = Array.isArray(linePathMap) ? linePathMap.length : Object.keys(linePathMap).length;

    // Index results by exact path for O(1) lookup.
    const pathTypes = Object.create(null);
    if (results && results.length) {
      for (const r of results) {
        if (r.type !== "unchanged") {
          pathTypes[r.path] = { type: r.type, path: r.path };
          if (r.newPath) pathTypes[r.newPath] = { type: r.type, path: r.newPath };
        }
      }
    }

    // Build a *prefix* index over changed paths: every ancestor prefix of a
    // changed path gets mapped to the nearest descendant's change info. This
    // replaces the O(changedPaths) walk-down loop inside findMatch with an
    // O(1) Map lookup. For a changed "a.b.c.d", we record prefixes "a.b.c",
    // "a.b", "a" — each pointing at the original change (first writer wins
    // so the shallowest ancestor reports the nearest descendant).
    const walkDownEnabled = lineCount <= WALK_DOWN_LIMIT_LINES;
    const prefixIndex = walkDownEnabled ? new Map() : null;
    if (walkDownEnabled) {
      for (const path of Object.keys(pathTypes)) {
        const parts = path.split(".");
        for (let i = parts.length - 1; i > 0; i--) {
          const prefix = parts.slice(0, i).join(".");
          if (!prefixIndex.has(prefix)) prefixIndex.set(prefix, pathTypes[path]);
        }
      }
    }

    // Cross-reference each line's path with results.
    for (const [lineNumStr, jsonPath] of Object.entries(linePathMap)) {
      if (!jsonPath) continue;
      const match = findMatch(jsonPath, pathTypes, prefixIndex);
      if (match) highlights.set(Number(lineNumStr), match);
    }

    return highlights;
  }, [jsonString, results]);
}

/**
 * 1. Exact match
 * 2. Walk up to parent paths that changed
 * 3. (Bounded) O(1) prefix index lookup for nested-change containers
 */
function findMatch(jsonPath, pathTypes, prefixIndex) {
  if (pathTypes[jsonPath]) return pathTypes[jsonPath];

  let p = jsonPath;
  while (p.includes(".")) {
    p = p.slice(0, p.lastIndexOf("."));
    if (pathTypes[p]) return pathTypes[p];
  }

  if (prefixIndex) return prefixIndex.get(jsonPath) ?? null;
  return null;
}

/**
 * Builds a map from line number -> JSON path for a pretty-printed JSON string.
 * Direct port of the vanilla JS buildLinePathMap().
 */
function buildLinePathMap(jsonStr) {
  const lines = jsonStr.split("\n");
  const stack = [];
  const map = {};
  const inArray = [];
  let depth = 0;

  function currentPath() {
    return stack.join(".");
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Detect closing before we record path
    if (trimmed.charAt(0) === "}" || trimmed.charAt(0) === "]") {
      if (depth > 0) {
        stack.pop();
        inArray.pop();
        depth--;
      }
    }

    // Current path for this line
    map[i] = currentPath();

    // Detect key: value
    const keyMatch = trimmed.match(/^"([^"]+)"\s*:/);
    if (keyMatch) {
      const key = keyMatch[1];
      const cp = currentPath();
      const fullPath = cp ? cp + "." + key : key;
      map[i] = fullPath;

      // Check if value opens an object/array
      const afterColon = trimmed.slice(trimmed.indexOf(":") + 1).trim();
      if (afterColon.charAt(0) === "{" || afterColon.charAt(0) === "[") {
        stack.push(key);
        inArray.push(afterColon.charAt(0) === "[");
        depth++;
      }
    } else if (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") {
      // Opening brace/bracket as standalone line
      if (depth === 0) {
        // Root object
        inArray.push(trimmed.charAt(0) === "[");
        depth++;
      } else if (inArray.length && inArray[inArray.length - 1]) {
        stack.push("[]");
        inArray.push(trimmed.charAt(0) === "[");
        depth++;
      } else {
        inArray.push(trimmed.charAt(0) === "[");
        depth++;
      }
    }
  }

  return map;
}
