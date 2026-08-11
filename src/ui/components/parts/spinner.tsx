import { Text, useAnimation } from "ink";
import { memo } from "react";
import { theme } from "../../theme.ts";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const FRAME_INTERVAL_MS = 80;

export interface SpinnerProps {
  /** Text shown next to the spinner. */
  readonly label?: string;
  readonly color?: string;
}

/**
 * Braille spinner with an optional label.
 *
 * Uses Ink's shared animation timer, so several spinners on screen still cost a
 * single render cycle.
 */
function SpinnerComponent({ label, color = theme.info }: SpinnerProps) {
  const { frame } = useAnimation({ interval: FRAME_INTERVAL_MS });
  const character = FRAMES[frame % FRAMES.length];

  return (
    <Text>
      <Text color={color}>{character}</Text>
      {label === undefined ? null : <Text> {label}</Text>}
    </Text>
  );
}

export const Spinner = memo(SpinnerComponent);
