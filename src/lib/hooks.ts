import { useEffect, useRef, useState } from "react";
import type { Unit } from "../../shared/types";

// Back-gesture handling for overlays (pages and sheets).
//
// While any overlay is open we keep exactly ONE extra history entry (the "trap"). Back pops it,
// and we close the top overlay; if more remain open we re-arm the trap. When the last overlay is
// closed from the UI, we remove the trap with history.back() — deferred a tick, so an overlay
// that opens in the same update (e.g. a sheet handing off to a page) reuses it instead of racing it.
const overlayStack: { close: () => void }[] = [];
let trapArmed = false;
let ignoreNextPop = false;
let pendingRemoval: ReturnType<typeof setTimeout> | null = null;

function armTrap() {
  history.pushState({ overlayTrap: true }, "");
  trapArmed = true;
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (ignoreNextPop) {
      ignoreNextPop = false; // our own history.back() removing the trap
      return;
    }
    if (!trapArmed) return;
    trapArmed = false;
    overlayStack.pop()?.close();
    if (overlayStack.length > 0) armTrap();
  });
}

/**
 * While mounted, makes the phone's Back button / gesture close this overlay instead of
 * leaving the app. Stacked overlays close top-first.
 */
export function useBackToClose(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const entry = { close: () => closeRef.current() };
    overlayStack.push(entry);
    if (pendingRemoval !== null) {
      clearTimeout(pendingRemoval); // reuse the trap that was about to be removed
      pendingRemoval = null;
    } else if (!trapArmed) {
      armTrap();
    }

    return () => {
      const index = overlayStack.indexOf(entry);
      if (index === -1) return; // already closed by Back
      overlayStack.splice(index, 1);
      if (overlayStack.length > 0 || !trapArmed || pendingRemoval !== null) return;
      pendingRemoval = setTimeout(() => {
        pendingRemoval = null;
        if (overlayStack.length > 0 || !trapArmed) return;
        trapArmed = false;
        ignoreNextPop = true;
        history.back();
      }, 0);
    };
  }, []);
}

const UNIT_KEY = "gym-buddy:unit";

export function useUnit(): [Unit, (unit: Unit) => void] {
  const [unit, setUnit] = useState<Unit>(() => {
    try {
      return localStorage.getItem(UNIT_KEY) === "kg" ? "kg" : "lb";
    } catch {
      return "lb";
    }
  });
  const update = (next: Unit) => {
    setUnit(next);
    try {
      localStorage.setItem(UNIT_KEY, next);
    } catch {
      // storage unavailable: preference just won't persist
    }
  };
  return [unit, update];
}

/** Fetch whenever `deps` change, with error state and manual reload. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null); // never show the previous inputs' data under new ones
    setError(null);
    load().then(
      (value) => {
        if (!cancelled) setData(value);
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong.");
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return { data, setData, error, reload: () => setVersion((v) => v + 1) };
}
