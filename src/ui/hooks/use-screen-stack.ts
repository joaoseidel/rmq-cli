import { useCallback, useState } from "react";

export interface ScreenStack<S> {
  readonly current: S;
  readonly previous: S | undefined;
  readonly depth: number;
  readonly canGoBack: boolean;
  readonly push: (screen: S) => void;
  readonly replace: (screen: S) => void;
  readonly back: () => void;
  readonly popUntil: (keep: (screen: S) => boolean) => void;
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

  const popUntil = useCallback((keep: (screen: S) => boolean) => {
    setStack((current) => {
      let end = current.length;

      while (end > 1 && !keep(current[end - 1] as S)) end -= 1;
      return end === current.length ? current : current.slice(0, end);
    });
  }, []);

  const reset = useCallback(() => setStack([root]), [root]);

  const current = stack[stack.length - 1] as S;

  return {
    current,
    previous: stack[stack.length - 2],
    depth: stack.length,
    canGoBack: stack.length > 1,
    push,
    replace,
    back,
    popUntil,
    reset,
  };
}
