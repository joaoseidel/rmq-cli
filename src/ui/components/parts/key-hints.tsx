import { Box, Text } from "ink";
import { memo } from "react";
import { theme } from "../../theme.ts";
import { displayWidth } from "../../utils/width.ts";

export interface KeyHint {
  readonly keys: string;
  readonly label: string;
}

export interface KeyHintsProps {
  readonly hints: readonly KeyHint[];
  /** Hints are dropped from the end when they will not fit. */
  readonly maxWidth: number;
}

const SEPARATOR = "  ";

/**
 * The footer key legend.
 *
 * Drops hints from the right rather than wrapping: a legend that reflows to a
 * second line changes the screen's chrome height mid-session and makes the
 * content area jump.
 */
function KeyHintsComponent({ hints, maxWidth }: KeyHintsProps) {
  const visible: KeyHint[] = [];
  let used = 0;

  for (const hint of hints) {
    const cost =
      displayWidth(`${hint.keys} ${hint.label}`) +
      (visible.length === 0 ? 0 : SEPARATOR.length);
    if (used + cost > maxWidth) break;
    visible.push(hint);
    used += cost;
  }

  return (
    <Box>
      {visible.map((hint, index) => (
        <Text key={hint.keys}>
          {index === 0 ? "" : SEPARATOR}
          <Text color={theme.info} bold>
            {hint.keys}
          </Text>
          <Text color={theme.muted}> {hint.label}</Text>
        </Text>
      ))}
    </Box>
  );
}

export const KeyHints = memo(KeyHintsComponent);
