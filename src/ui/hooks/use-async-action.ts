import { useCallback, useEffect, useRef, useState } from "react";
import { toError } from "../../core/util/text.ts";

export type ActionState<T> =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "success"; readonly data: T }
  | { readonly status: "failure"; readonly error: Error };

export interface AsyncAction<T, A extends unknown[]> {
  readonly state: ActionState<T>;
  readonly run: (...args: A) => void;
}

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

export function useActionResult<T>(
  state: ActionState<T>,
  onSuccess: (data: T) => void,
): void {
  const data = state.status === "success" ? state.data : null;

  useEffect(() => {
    if (data !== null) onSuccess(data);
  }, [data, onSuccess]);
}
