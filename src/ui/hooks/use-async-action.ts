import { useCallback, useEffect, useRef, useState } from "react";
import { toError } from "../../core/util/text.ts";

export type ActionState<T> =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "success"; readonly data: T }
  | { readonly status: "failure"; readonly error: Error };

export interface AsyncAction<T, A extends unknown[]> {
  readonly state: ActionState<T>;
  /** Starts the action. Ignored while a previous run is still in flight. */
  readonly run: (...args: A) => void;
}

/**
 * An async operation triggered by the user rather than by mounting.
 *
 * The counterpart to {@link useAsync}: purges, deletes, and requeues must not
 * start until a confirmation has been answered. Concurrent runs are refused
 * outright — for destructive operations, coalescing a double keypress into one
 * execution is the only safe behaviour.
 */
export function useAsyncAction<T, A extends unknown[] = []>(
  action: (...args: A) => Promise<T>,
): AsyncAction<T, A> {
  const [state, setState] = useState<ActionState<T>>({ status: "idle" });

  const actionRef = useRef(action);
  actionRef.current = action;

  const runningRef = useRef(false);

  const run = useCallback((...args: A) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState({ status: "running" });

    actionRef
      .current(...args)
      .then((data) => setState({ status: "success", data }))
      .catch((error: unknown) =>
        setState({ status: "failure", error: toError(error) }),
      )
      .finally(() => {
        runningRef.current = false;
      });
  }, []);

  return { state, run };
}

/**
 * Runs `onSuccess` once, after an action has succeeded.
 *
 * Every action screen ends by navigating or reporting, and each had written out
 * the same "derive the datum, then fire it from an effect" pair. It has to be an
 * effect rather than a branch in the render: the callbacks navigate, and moving
 * the stack during render would update the app mid-paint.
 */
export function useActionResult<T>(
  state: ActionState<T>,
  onSuccess: (data: T) => void,
): void {
  const data = state.status === "success" ? state.data : null;

  useEffect(() => {
    if (data !== null) onSuccess(data);
  }, [data, onSuccess]);
}
