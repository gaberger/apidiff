import { useMemo } from "react";

/**
 * Maps diff results to line numbers in a JSON string.
 * Ported from the vanilla buildLinePathMap() in index.html.
 *
 * @param {string} jsonString - pretty-printed JSON text
 * @param {Array<{ path: string, newPath?: string, type: string }>} results - diff results
 * @returns {Map<number, { type: string, path: string }>} line number -> change info
 */
export function useDiffHighlight(jsonString, results) {
  return useMemo(() => {
    const highlights = new Map();
    if (!jsonString) return highlights;

    // Step 1: build line -> JSON path map (mirrors vanilla buildLinePathMap)
    const linePathMap = buildLinePathMap(jsonString);

    // Step 2: index results by path for fast lookup
    const pathTypes = {};
    if (results && results.length) {
      for (const r of results) {
        if (r.type !== "unchanged") {
          pathTypes[r.path] = { type: r.type, path: r.path };
          if (r.newPath) {
            pathTypes[r.newPath] = { type: r.type, path: r.newPath };
          }
        }
      }
    }

    // Step 3: cross-reference each line's path with results
    for (const [lineNum, jsonPath] of Object.entries(linePathMap)) {
      if (!jsonPath) continue;

      // Check exact match first, then walk up parent paths
      const match = findMatch(jsonPath, pathTypes);
      if (match) {
        highlights.set(Number(lineNum), match);
      }
    }

    return highlights;
  }, [jsonString, results]);
}

/**
 * Find a matching path in pathTypes by checking:
 * 1. Exact match
 * 2. This line is a child of a changed path (walk up)
 * 3. A changed path is a child of this line (walk down — for object openers)
 */
function findMatch(jsonPath, pathTypes) {
  if (pathTypes[jsonPath]) return pathTypes[jsonPath];

  // Check if this line is a child of a changed path (walk up)
  let p = jsonPath;
  while (p.includes(".")) {
    p = p.slice(0, p.lastIndexOf("."));
    if (pathTypes[p]) return pathTypes[p];
  }

  // Check if a changed path is nested under this line (walk down)
  // e.g., line path is "properties.message_sid", result path is "properties.message_sid.type"
  for (const changedPath of Object.keys(pathTypes)) {
    if (changedPath.startsWith(jsonPath + ".")) {
      return pathTypes[changedPath];
    }
  }

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
