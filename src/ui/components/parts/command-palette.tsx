import { Box, Text } from "ink";
import { useMemo, useState } from "react";
import { useCaptureInput } from "../../hooks/use-input-capture.tsx";
import { glyphs, theme } from "../../theme.ts";
import { Select, type SelectItem } from "../common/select.tsx";
import { TextInput } from "../common/text-input.tsx";

export interface PaletteAction {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly unavailable?: string;
}

export interface CommandPaletteProps {
  readonly actions: readonly PaletteAction[];
  readonly onRun: (id: string) => void;
  readonly onCancel: () => void;
  readonly width: number;
  readonly height: number;
}

export function CommandPalette({
  actions,
  onRun,
  onCancel,
  width,
  height,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  useCaptureInput(true);

  const items = useMemo<SelectItem<string>[]>(() => {
    const needle = query.trim().toLowerCase();

    const rank = (action: PaletteAction): number => {
      const label = action.label.toLowerCase();
      if (label.startsWith(needle)) return 0;
      if (label.includes(needle)) return 1;
      if (action.hint.toLowerCase().includes(needle)) return 2;
      return 3;
    };

    return actions
      .map((action, index) => ({ action, index, rank: rank(action) }))
      .filter((entry) => needle === "" || entry.rank < 3)
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map(({ action }) => ({
        value: action.id,
        label: action.label,
        detail: action.unavailable ?? action.hint,
        disabled: action.unavailable !== undefined,
      }));
  }, [actions, query]);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.info}>{glyphs.cursor} </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder="type to filter actions"
          isActive
        />
      </Box>
      <Box height={1} />

      <Select
        items={items}
        width={width}
        visibleCount={Math.max(3, height - 4)}
        letterKeys={false}
        isActive
        onCancel={onCancel}
        onSubmit={onRun}
        emptyLabel="No actions match."
      />
    </Box>
  );
}
