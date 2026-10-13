/**
 * Refcounted body scroll lock.
 *
 * The naive pattern (save style.overflow, set "hidden", restore on cleanup)
 * corrupts itself when two locks overlap: the second captures "hidden" as
 * its "previous" value and restores it on unmount, leaving the body locked
 * forever. Refcounting means the style only restores when the LAST lock
 * releases.
 */
let depth = 0;
let saved = "";

export function lockBodyScroll(): () => void {
  if (depth++ === 0) {
    saved = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--depth === 0) document.body.style.overflow = saved;
  };
}
