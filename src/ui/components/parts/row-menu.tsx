import { Box, Text } from "ink";
import { theme } from "../../theme.ts";
import { Select, type SelectItem } from "../common/select.tsx";
import type { PaletteAction } from "./command-palette.tsx";

export interface RowMenuProps {
  readonly subject: string;
  readonly detail?: string;
  readonly actions: readonly PaletteAction[];
  readonly onRun: (id: string) => void;
  readonly onCancel: () => void;
  readonly width: number;
  readonly height: number;
}

export function RowMenu({
  subject,
  detail,
  actions,
  onRun,
  onCancel,
  width,
  height,
}: RowMenuProps) {
  const items: SelectItem<string>[] = actions.map((action) => ({
    value: action.id,
    label: action.label,
    detail: action.unavailable ?? action.hint,
    disabled: action.unavailable !== undefined,
  }));

  const menuWidth = Math.min(Math.max(48, Math.floor(width * 0.6)), width - 2);

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box
        flexDirection="column"
        width={menuWidth}
        borderStyle="round"
        borderColor={theme.info}
        paddingX={1}
      >
        <Text bold color={theme.info} wrap="truncate">
          {subject}
        </Text>
        {detail === undefined ? null : (
          <Text color={theme.muted} wrap="truncate">
            {detail}
          </Text>
        )}

        <Box height={1} />

        <Select
          items={items}
          width={menuWidth - 4}
          visibleCount={Math.max(3, height - 8)}
          letterKeys={false}
          isActive
          onCancel={onCancel}
          onSubmit={onRun}
          emptyLabel="Nothing to do with this row."
        />
      </Box>
    </Box>
  );
}
