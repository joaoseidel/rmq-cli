import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { bindingsFor, type KeyBinding } from "../../keymap.ts";
import type { ScreenName } from "../../screens.ts";
import { glyphs, theme } from "../../theme.ts";

interface Binding {
  readonly keys: string;
  readonly description: string;
}

interface Section {
  readonly title: string;
  readonly bindings: readonly Binding[];
  readonly here?: boolean;
}

const SCREEN_LABELS: Partial<Record<ScreenName, string>> = {
  queues: "Queue list",
  queue: "Message list",
  message: "Message view",
  search: "Search results",
  consume: "Live tail",
  connections: "Connections",
};

const LIST_SCREENS: readonly ScreenName[] = [
  "queues",
  "queue",
  "search",
  "connections",
  "vhosts",
];

const ANYWHERE: Section = {
  title: "Anywhere",
  bindings: [
    { keys: ":", description: "open the action list" },
    { keys: ".", description: "actions for the row under the cursor" },
    { keys: "?", description: "this help" },
    { keys: "esc", description: "go back one screen" },
    { keys: "q", description: "back, or quit from queues" },
    { keys: "ctrl+c", description: "quit immediately" },
  ],
};

const LISTS: Section = {
  title: "Lists",
  bindings: [
    { keys: "↑ ↓ / j k", description: "move the cursor" },
    { keys: "PgUp PgDn", description: "move a page" },
    { keys: "g / G", description: "first / last" },
    { keys: "⏎", description: "open the selected row" },
  ],
};

function describe(binding: KeyBinding): Binding {
  return {
    keys: binding.key,
    description: binding.description ?? binding.label,
  };
}

export function sectionsFor(from: ScreenName): readonly Section[] {
  const sections: Section[] = [];

  const label = SCREEN_LABELS[from];
  const bindings = bindingsFor(from).map(describe);
  if (label !== undefined && bindings.length > 0) {
    sections.push({ title: label, bindings, here: true });
  }

  sections.push(ANYWHERE);
  if (LIST_SCREENS.includes(from)) sections.push(LISTS);

  return sections;
}

const KEY_COLUMN = 12;

function linesFor(
  sections: readonly Section[],
  columnWidth: number,
): ReactNode[] {
  const lines: ReactNode[] = [];

  for (const [index, section] of sections.entries()) {
    if (index > 0) lines.push(<Text key={`gap-${section.title}`}> </Text>);

    lines.push(
      <Text
        key={`title-${section.title}`}
        wrap="truncate"
        bold
        color={section.here === true ? theme.warning : theme.info}
      >
        {section.here === true
          ? `${glyphs.cursor} ${section.title} (you are here)`
          : section.title}
      </Text>,
    );

    for (const binding of section.bindings) {
      lines.push(
        <Text key={`${section.title}-${binding.keys}`} wrap="truncate">
          <Text color={theme.warning}>
            {`  ${binding.keys}`.padEnd(KEY_COLUMN)}
          </Text>
          <Text color={theme.muted}>{binding.description}</Text>
        </Text>,
      );
    }
  }

  return lines;
}

export interface HelpScreenProps {
  readonly from: ScreenName;
  readonly width: number;
  readonly height: number;
}

export function HelpScreen({ from, width, height }: HelpScreenProps) {
  const rows = Math.max(1, height - 1);
  const sections = sectionsFor(from);
  const total = sections.reduce(
    (sum, section) => sum + section.bindings.length + 2,
    0,
  );

  const twoColumn = width >= 80 && total > rows;
  const columnWidth = twoColumn ? Math.floor(width / 2) : width;

  const left: Section[] = [];
  const right: Section[] = [];
  let used = 0;

  for (const section of sections) {
    const cost = section.bindings.length + 2;
    if (!twoColumn || left.length === 0 || used + cost <= rows) {
      left.push(section);
      used += cost;
    } else {
      right.push(section);
    }
  }

  const first = linesFor(left, columnWidth).slice(0, rows);
  const second = linesFor(right, columnWidth).slice(0, rows);

  return (
    <Box flexDirection="column">
      <Box>
        <Box flexDirection="column" width={columnWidth}>
          {first}
        </Box>
        {second.length > 0 ? (
          <Box flexDirection="column" width={columnWidth}>
            {second}
          </Box>
        ) : null}
      </Box>

      <Text color={theme.muted}>
        {glyphs.bullet} Browsing never consumes. Only purge, delete, move, and
        export-with-removal ask first, then change the broker.
      </Text>
    </Box>
  );
}
