import { useEffect, useRef, useState } from "react";
import type { Unit } from "../../shared/types";

/**
 * While mounted, pushes a history entry so the phone's Back button / gesture
 * closes the overlay instead of leaving the app.
 */
export function useBackToClose(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const token = Math.random().toString(36).slice(2);
    history.pushState({ overlay: token }, "");
    let poppedByBack = false;
    const onPop = () => {
      poppedByBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed from the UI: drop the entry we pushed.
      if (!poppedByBack && history.state?.overlay === token) history.back();
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
