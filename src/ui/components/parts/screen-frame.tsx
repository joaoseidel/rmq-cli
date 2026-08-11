import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { borders, glyphs, theme } from "../../theme.ts";
import { KeyHints, type KeyHint } from "./key-hints.tsx";

/**
 * Lines of chrome the frame occupies: title, rule, blank, [status], rule, hints.
 * Screens subtract this from the terminal height to size their scroll region, so
 * it has to match what {@link ScreenFrame} actually renders.
 */
export const SCREEN_CHROME_LINES = 5;

export interface ScreenFrameProps {
  readonly title: string;
  /** Breadcrumb context — the connection and vhost being browsed. */
  readonly subtitle?: string;
  /** Right-aligned indicator, e.g. a live badge. */
  readonly badge?: ReactNode;
  readonly hints: readonly KeyHint[];
  /** Transient result of the last action, shown above the content. */
  readonly status?: ReactNode;
  readonly width: number;
  readonly height: number;
  readonly children: ReactNode;
}

/**
 * Full-screen shell: fixed header, flexible body, pinned footer.
 *
 * The outer box is given the exact terminal dimensions so the frame fills the
 * alternate screen buffer, and the body takes the remaining space via
 * `flexGrow`, which keeps the footer welded to the bottom regardless of how much
 * the current screen draws.
 */
export function ScreenFrame({
  title,
  subtitle,
  badge,
  hints,
  status,
  width,
  height,
  children,
}: ScreenFrameProps) {
  const rule = borders.horizontal.repeat(width);

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box width={width}>
        <Text bold color={theme.info}>
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text color={theme.muted}>
            {" "}
            {glyphs.bullet} {subtitle}
          </Text>
        )}
        <Box flexGrow={1} />
        {badge}
      </Box>

      <Text color={theme.border}>{rule}</Text>

      {status === undefined ? null : <Box width={width}>{status}</Box>}

      {/* Clipped, not scrolling: a screen that overdraws must not push the
          header and footer off the terminal. Screens size their own content
          to the height they are given. */}
      <Box flexDirection="column" flexGrow={1} width={width} overflow="hidden">
        {children}
      </Box>

      <Text color={theme.border}>{rule}</Text>

      <KeyHints hints={hints} maxWidth={width} />
    </Box>
  );
}
