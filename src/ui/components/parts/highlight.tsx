import { Text } from "ink";
import { memo } from "react";
import { removeGlob, splitOnMatch } from "../../../core/util/glob.ts";
import { theme } from "../../theme.ts";

export interface HighlightProps {
  readonly text: string;
  /** Search pattern; glob metacharacters are stripped before matching. */
  readonly pattern?: string;
  readonly dimmed?: boolean;
}

/**
 * Renders text with search hits tinted.
 *
 * Highlighting is applied at render time rather than by splicing ANSI codes into
 * the string, so the underlying value stays measurable — table column widths are
 * computed from the plain text, and `--json` output is unaffected.
 */
function HighlightComponent({
  text,
  pattern = "",
  dimmed = false,
}: HighlightProps) {
  const literal = removeGlob(pattern);

  if (literal === "") {
    return <Text color={dimmed ? theme.muted : undefined}>{text}</Text>;
  }

  return (
    <Text color={dimmed ? theme.muted : undefined}>
      {splitOnMatch(text, literal).map((segment, index) =>
        segment.match ? (
          <Text key={index} color={theme.info} bold>
            {segment.text}
          </Text>
        ) : (
          <Text key={index}>{segment.text}</Text>
        ),
      )}
    </Text>
  );
}

export const Highlight = memo(HighlightComponent);
