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
  /** Shown greyed with a reason when the action is unavailable here. */
  readonly unavailable?: string;
}

export interface CommandPaletteProps {
  readonly actions: readonly PaletteAction[];
  readonly onRun: (id: string) => void;
  readonly onCancel: () => void;
  readonly width: number;
  readonly height: number;
}

/**
 * Searchable list of everything available from the current screen.
 *
 * With no command line to fall back on, this is how a user finds a capability
 * they have not memorised a key for. Unavailable actions are listed with the
 * reason rather than hidden, so the absence of an option is explainable instead
 * of looking like a missing feature.
 */
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

    return actions
      .filter(
        (action) =>
          needle === "" ||
          `${action.label} ${action.hint}`.toLowerCase().includes(needle),
      )
      .map((action) => ({
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
