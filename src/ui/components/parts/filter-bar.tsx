import { Box, Text } from "ink";
import { useCaptureInput } from "../../hooks/use-input-capture.tsx";
import { theme } from "../../theme.ts";
import { TextInput } from "../common/text-input.tsx";

export interface FilterBarProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly active: boolean;
  readonly label?: string;
  readonly matchCount?: number;
}

export function FilterBar({
  value,
  onChange,
  onSubmit,
  onCancel,
  active,
  label = "filter",
  matchCount,
}: FilterBarProps) {
  useCaptureInput(active);

  if (!active && value === "") return null;

  return (
    <Box>
      <Text color={active ? theme.info : theme.muted}>{label}: </Text>
      {active ? (
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          onCancel={onCancel}
          isActive
        />
      ) : (
        <Text color={theme.warning}>{value}</Text>
      )}
      {!active && matchCount !== undefined ? (
        <Text color={theme.muted}> ({matchCount} matching)</Text>
      ) : null}
      {active ? (
        <Text color={theme.muted}> (Enter to apply, Esc to clear)</Text>
      ) : null}
    </Box>
  );
}
