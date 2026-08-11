import { Text, useAnimation } from "ink";
import { memo } from "react";
import { theme } from "../../theme.ts";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const FRAME_INTERVAL_MS = 80;

export interface SpinnerProps {
  readonly label?: string;
  readonly color?: string;
}

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
