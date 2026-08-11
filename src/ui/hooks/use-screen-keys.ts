import type { ActionId } from "../actions.ts";
import { bindingForKey } from "../keymap.ts";
import type { ScreenName } from "../screens.ts";
import { useKeyHandler } from "./use-key-handler.ts";

export interface ScreenKeysOptions {
  readonly isActive: boolean;
  readonly local?: Readonly<Record<string, () => void>>;
}

export function useScreenKeys(
  screen: ScreenName,
  onAction: (id: ActionId) => void,
  options: ScreenKeysOptions,
): void {
  useKeyHandler(
    (input) => {
      const local = options.local?.[input];
      if (local !== undefined) {
        local();
        return;
      }

      const action = bindingForKey(screen, input)?.action;
      if (action !== undefined) onAction(action);
    },
    { isActive: options.isActive },
  );
}
