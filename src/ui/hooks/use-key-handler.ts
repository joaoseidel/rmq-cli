import { useInput, type Key } from "ink";
import { useRef } from "react";

export type KeyHandler = (input: string, key: Key) => void;

export interface KeyHandlerOptions {
  readonly isActive?: boolean;
}

export function useKeyHandler(
  handler: KeyHandler,
  options: KeyHandlerOptions = {},
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useInput(
    (input, key) => {
      handlerRef.current(input, key);
    },
    { isActive: options.isActive ?? true },
  );
}
