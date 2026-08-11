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
  readonly bare?: boolean;
}

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

export function Name({ children }: { readonly children: ReactNode }) {
  return <Text color={theme.info}>&apos;{children}&apos;</Text>;
}

export function Muted({ children }: { readonly children: ReactNode }) {
  return <Text color={theme.muted}>{children}</Text>;
}
