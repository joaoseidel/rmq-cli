import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { borders, glyphs, theme } from "../../theme.ts";
import { KeyHints, type KeyHint } from "./key-hints.tsx";

export const SCREEN_CHROME_LINES = 5;

export interface ScreenFrameProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly badge?: ReactNode;
  readonly hints: readonly KeyHint[];
  readonly status?: ReactNode;
  readonly footerNote?: ReactNode;
  readonly width: number;
  readonly height: number;
  readonly children: ReactNode;
}

export function ScreenFrame({
  title,
  subtitle,
  badge,
  hints,
  status,
  footerNote,
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

      {}
      <Box flexDirection="column" flexGrow={1} width={width} overflow="hidden">
        {children}
      </Box>

      <Text color={theme.border}>{rule}</Text>

      {footerNote}

      <KeyHints hints={hints} maxWidth={width} />
    </Box>
  );
}
