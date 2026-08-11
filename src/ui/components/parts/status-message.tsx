import { Text } from "ink";
import { memo, type ReactNode } from "react";
import { glyphs, theme } from "../../theme.ts";

export type StatusTone = "success" | "danger" | "warning" | "info" | "muted";

const TONES: Record<StatusTone, { color: string; prefix: string }> = {
  success: { color: theme.success, prefix: glyphs.check },
  danger: { color: theme.danger, prefix: "Error:" },
  warning: { color: theme.warning, prefix: glyphs.warning },
  info: { color: theme.info, prefix: glyphs.bullet },
  muted: { color: theme.muted, prefix: glyphs.bullet },
};

export interface StatusMessageProps {
  readonly tone: StatusTone;
  readonly children: ReactNode;
  /** Drops the leading glyph, for lines that continue a previous message. */
  readonly bare?: boolean;
}

/**
 * A single tone-coded line: the CLI's unit of feedback.
 *
 * Rendered as one inline `<Text>` rather than a `<Box>` of parts. A Box lays its
 * children out with flexbox and wraps each independently, which splits a message
 * across lines at arbitrary points — badly visible when the tail is a long file
 * path.
 */
function StatusMessageComponent({
  tone,
  children,
  bare = false,
}: StatusMessageProps) {
  const { color, prefix } = TONES[tone];

  return (
    <Text color={tone === "muted" ? theme.muted : undefined}>
      {bare ? null : (
        <Text color={color} bold={tone === "danger"}>
          {prefix}{" "}
        </Text>
      )}
      {children}
    </Text>
  );
}

export const StatusMessage = memo(StatusMessageComponent);

/** Emphasised inline name, matching the `'name'` convention used in messages. */
export function Name({ children }: { readonly children: ReactNode }) {
  return <Text color={theme.info}>&apos;{children}&apos;</Text>;
}

/** De-emphasised inline detail, for flags and paths quoted inside prose. */
export function Muted({ children }: { readonly children: ReactNode }) {
  return <Text color={theme.muted}>{children}</Text>;
}
