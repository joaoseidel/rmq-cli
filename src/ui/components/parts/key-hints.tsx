import { Box, Text } from "ink";
import { memo } from "react";
import { theme } from "../../theme.ts";
import { displayWidth } from "../../utils/width.ts";

export interface KeyHint {
  readonly keys: string;
  readonly label: string;
  readonly essential?: boolean;
}

export interface KeyHintsProps {
  readonly hints: readonly KeyHint[];
  readonly maxWidth: number;
}

const SEPARATOR = "  ";

const cost = (hint: KeyHint) => displayWidth(`${hint.keys} ${hint.label}`);

function KeyHintsComponent({ hints, maxWidth }: KeyHintsProps) {
  const essential = hints.filter((hint) => hint.essential === true);
  const optional = hints.filter((hint) => hint.essential !== true);

  const reserved = essential.reduce(
    (sum, hint) => sum + cost(hint) + SEPARATOR.length,
    0,
  );

  const kept: KeyHint[] = [];
  let used = 0;

  for (const hint of optional) {
    const width = cost(hint) + (kept.length === 0 ? 0 : SEPARATOR.length);
    if (used + width + reserved > maxWidth) break;
    kept.push(hint);
    used += width;
  }

  const visible = [...kept, ...essential];

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
