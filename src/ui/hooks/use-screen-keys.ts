import type { ActionId } from "../actions.ts";
import { bindingForKey } from "../keymap.ts";
import type { ScreenName } from "../screens.ts";
import { useKeyHandler } from "./use-key-handler.ts";

export interface ScreenKeysOptions {
  readonly isActive: boolean;
  /**
   * Keys the screen handles itself, by character. Consulted before the shared
   * table, so a screen can override a binding without editing the table.
   */
  readonly local?: Readonly<Record<string, () => void>>;
}

/**
 * Dispatches a screen's keys from the shared {@link SCREEN_KEYS} table.
 *
 * Screens used to spell out an `if (input === "e") onAction("export")` ladder
 * each, which is how the footer and the help screen drifted away from what was
 * actually bound. Now the table is the only place a key is declared.
 */
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
