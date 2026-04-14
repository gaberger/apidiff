import { useEffect, useRef } from "react";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

function normalizeKey(spec) {
  const parts = spec.toLowerCase().split("+").map((s) => s.trim());
  const out = { mod: false, shift: false, alt: false, key: "" };
  for (const p of parts) {
    if (p === "mod" || p === "cmd" || p === "ctrl") out.mod = true;
    else if (p === "shift") out.shift = true;
    else if (p === "alt" || p === "option") out.alt = true;
    else out.key = p;
  }
  return out;
}

function matches(event, spec) {
  const wantMod = spec.mod;
  const hasMod = IS_MAC ? event.metaKey : event.ctrlKey;
  if (hasMod !== wantMod) return false;
  if (!!event.shiftKey !== spec.shift) return false;
  if (!!event.altKey !== spec.alt) return false;
  const k = event.key.toLowerCase();
  if (spec.key === "enter") return k === "enter";
  if (spec.key === "escape") return k === "escape" || k === "esc";
  if (spec.key === "?") return event.key === "?";
  return k === spec.key;
}

function isEditableTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

const ALWAYS_FIRE_INSIDE_EDITORS = new Set(["escape", "enter"]);

export function useKeyboardShortcuts(shortcutMap) {
  const mapRef = useRef(shortcutMap);
  useEffect(() => { mapRef.current = shortcutMap; }, [shortcutMap]);

  useEffect(() => {
    const specs = Object.entries(mapRef.current || {}).map(([spec, handler]) => ({
      raw: spec,
      parsed: normalizeKey(spec),
      handler,
    }));

    const onKey = (e) => {
      const inEditor = isEditableTarget(e.target);
      for (const { parsed, handler } of specs) {
        if (!matches(e, parsed)) continue;
        if (inEditor && !parsed.mod && !ALWAYS_FIRE_INSIDE_EDITORS.has(parsed.key)) continue;
        e.preventDefault();
        handler(e);
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export const IS_MAC_PLATFORM = IS_MAC;
