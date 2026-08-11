import { useInput, type Key } from "ink";
import { useRef } from "react";

export type KeyHandler = (input: string, key: Key) => void;

export interface KeyHandlerOptions {
  readonly isActive?: boolean;
}

/**
 * `useInput`, but the handler always sees the current render's values.
 *
 * Ink subscribes the keypress listener in an effect keyed only on `isActive`
 * and the stdin emitter, so the function it holds is the one created on the
 * render where the subscription happened. Every later render's closure — and
 * therefore every piece of state it reads — is ignored. In practice that means a
 * text field reads back its initial empty value on every keystroke, and a list
 * acts on whichever row was selected when the screen first appeared.
 *
 * Routing through a ref sidesteps it entirely: the function Ink captures is a
 * thin forwarder over a stable ref, and the ref is refreshed on every render.
 *
 * Use this everywhere instead of `useInput` directly.
 */
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
