import { useEffect, useRef, useState } from "react";
import { toError } from "../../core/util/text.ts";

export type AsyncState<T> =
  | { readonly status: "pending" }
  | { readonly status: "success"; readonly data: T }
  | { readonly status: "failure"; readonly error: Error };

export interface AsyncResult<T> {
  readonly state: AsyncState<T>;
}

/**
 * Runs an async task and tracks its state across renders.
 *
 * Results from a superseded run are dropped: every run is stamped with a token
 * and only the newest token may write state. Without that, a slow first request
 * can land after a fast reload and show stale data — very visible in the TUI,
 * where filtering fires a new query on every keystroke.
 *
 * `deps` behaves like a `useEffect` dependency list; the task re-runs when it
 * changes. The task itself is intentionally not a dependency, so callers can
 * pass an inline closure without re-triggering on every render.
 */
export function useAsync<T>(
  task: () => Promise<T>,
  deps: readonly unknown[] = [],
): AsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "pending" });

  const taskRef = useRef(task);
  taskRef.current = task;

  const tokenRef = useRef(0);

  useEffect(() => {
    const token = ++tokenRef.current;
    let active = true;

    setState({ status: "pending" });

    taskRef
      .current()
      .then((data) => {
        if (!active || token !== tokenRef.current) return;
        setState({ status: "success", data });
      })
      .catch((error: unknown) => {
        if (!active || token !== tokenRef.current) return;
        setState({ status: "failure", error: toError(error) });
      });

    return () => {
      active = false;
    };
    // `deps` is spread deliberately: the task closure is held in a ref so it
    // can change every render without re-triggering the effect.
  }, deps);

  return { state };
}
