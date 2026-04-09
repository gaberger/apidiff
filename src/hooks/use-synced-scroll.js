import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Synchronizes scroll positions between two elements.
 * Ported from the vanilla syncScroll() in index.html.
 *
 * @param {React.RefObject} refA - first scrollable element
 * @param {React.RefObject} refB - second scrollable element
 * @param {boolean} enabled - whether scroll listeners are active
 * @returns {{ scrollLocked: boolean, toggleScrollLock: () => void }}
 */
export function useSyncedScroll(refA, refB, enabled = true) {
  const [scrollLocked, setScrollLocked] = useState(false);
  const isSyncing = useRef(false);

  const toggleScrollLock = useCallback(() => {
    setScrollLocked((prev) => !prev);
  }, []);

  // Temporarily suppress sync — call before programmatic scrolls
  const suppressSync = useCallback(() => {
    isSyncing.current = true;
    setTimeout(() => { isSyncing.current = false; }, 100);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const elA = refA.current;
    const elB = refB.current;
    if (!elA || !elB) return;

    function handleScroll(source, target) {
      return function onScroll() {
        if (isSyncing.current) return;
        isSyncing.current = true;

        if (scrollLocked) {
          // Proportional sync: map scroll ratio from source to target
          const maxSource = source.scrollHeight - source.clientHeight;
          const maxTarget = target.scrollHeight - target.clientHeight;
          if (maxSource > 0 && maxTarget > 0) {
            const ratio = source.scrollTop / maxSource;
            target.scrollTop = ratio * maxTarget;
          }
          target.scrollLeft = source.scrollLeft;
        }

        isSyncing.current = false;
      };
    }

    const onScrollA = handleScroll(elA, elB);
    const onScrollB = handleScroll(elB, elA);

    elA.addEventListener("scroll", onScrollA, { passive: true });
    elB.addEventListener("scroll", onScrollB, { passive: true });

    return () => {
      elA.removeEventListener("scroll", onScrollA);
      elB.removeEventListener("scroll", onScrollB);
    };
  }, [refA, refB, enabled, scrollLocked]);

  return { scrollLocked, toggleScrollLock, suppressSync };
}
