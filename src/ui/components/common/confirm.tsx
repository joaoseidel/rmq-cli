import { Box, Text } from "ink";
import { memo, type ReactNode } from "react";
import { useKeyHandler } from "../../hooks/use-key-handler.ts";
import { theme } from "../../theme.ts";

export interface ConfirmProps {
  readonly message: ReactNode;
  readonly onAnswer: (confirmed: boolean) => void;
  /** When false, bare Enter accepts. Defaults to requiring an explicit `y`. */
  readonly defaultNo?: boolean;
  readonly isActive?: boolean;
}

/**
 * Yes/no prompt for destructive actions.
 *
 * Defaults to "no": every caller is about to delete, purge, or drain something,
 * and a stray keystroke should never be the thing that confirms it.
 */
function ConfirmComponent({
  message,
  onAnswer,
  defaultNo = true,
  isActive = true,
}: ConfirmProps) {
  useKeyHandler(
    (input, key) => {
      const answer = input.toLowerCase();

      if (answer === "y") onAnswer(true);
      else if (answer === "n" || key.escape) onAnswer(false);
      else if (key.return) onAnswer(!defaultNo);
    },
    { isActive },
  );

  return (
    <Box>
      <Text color={theme.warning}>{message}</Text>
      <Text color={theme.muted}> {defaultNo ? "(y/N)" : "(Y/n)"} </Text>
    </Box>
  );
}

export const Confirm = memo(ConfirmComponent);
