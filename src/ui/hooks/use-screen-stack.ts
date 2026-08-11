import { useCallback, useState } from "react";

/**
 * A navigation stack of screens.
 *
 * The TUI drills down — queues → queue → message — and Escape has to unwind
 * exactly one level. A stack models that directly, and each entry carries its
 * own parameters so a screen never has to reconstruct where it came from.
 *
 * The root entry is never popped, so `current` is always defined.
 */
export interface ScreenStack<S> {
  readonly current: S;
  readonly depth: number;
  readonly canGoBack: boolean;
  readonly push: (screen: S) => void;
  readonly replace: (screen: S) => void;
  readonly back: () => void;
  readonly reset: () => void;
}

export function useScreenStack<S>(root: S): ScreenStack<S> {
  const [stack, setStack] = useState<S[]>([root]);

  const push = useCallback((screen: S) => {
    setStack((current) => [...current, screen]);
  }, []);

  const replace = useCallback((screen: S) => {
    setStack((current) => [...current.slice(0, -1), screen]);
  }, []);

  const back = useCallback(() => {
    setStack((current) =>
      current.length > 1 ? current.slice(0, -1) : current,
    );
  }, []);

  const reset = useCallback(() => setStack([root]), [root]);

  // The stack is seeded with the root and pops stop at length 1.
  const current = stack[stack.length - 1] as S;

  return {
    current,
    depth: stack.length,
    canGoBack: stack.length > 1,
    push,
    replace,
    back,
    reset,
  };
}
