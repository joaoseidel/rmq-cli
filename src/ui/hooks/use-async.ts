import { useEffect, useRef, useState } from "react";
import { toError } from "../../core/util/text.ts";

export type AsyncState<T> =
  | { readonly status: "pending" }
  | { readonly status: "success"; readonly data: T }
  | { readonly status: "failure"; readonly error: Error };

export interface AsyncResult<T> {
  readonly state: AsyncState<T>;
}

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
  }, deps);

  return { state };
}
