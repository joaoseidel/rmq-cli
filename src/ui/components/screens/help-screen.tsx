import { Box, Text } from "ink";
import { bindingsFor, type KeyBinding } from "../../keymap.ts";
import { glyphs, theme } from "../../theme.ts";

interface Binding {
  readonly keys: string;
  readonly description: string;
}

interface Section {
  readonly title: string;
  readonly bindings: readonly Binding[];
}

/** Keys the app handles itself, on every screen. */
const GLOBAL_SECTIONS: readonly Section[] = [
  {
    title: "Anywhere",
    bindings: [
      { keys: ":", description: "open the action list" },
      { keys: "?", description: "this help" },
      { keys: "esc", description: "go back one screen" },
      { keys: "q", description: "back, or quit from queues" },
      { keys: "ctrl+c", description: "quit immediately" },
    ],
  },
  {
    title: "Lists",
    bindings: [
      { keys: "↑ ↓ / j k", description: "move the cursor" },
      { keys: "PgUp PgDn", description: "move a page" },
      { keys: "g / G", description: "first / last" },
      { keys: "⏎", description: "open the selected row" },
    ],
  },
];

function describe(binding: KeyBinding): Binding {
  return {
    keys: binding.key,
    description: binding.description ?? binding.label,
  };
}

/**
 * Per-screen sections read straight off the keymap.
 *
 * Deriving them is the point: this page used to be a hand-written third copy of
 * the bindings and had drifted from what the screens actually bound.
 */
const SCREEN_SECTIONS: readonly Section[] = [
  {
    title: "Queue list",
    bindings: bindingsFor("queues")
      .filter((b) => b.displayOnly !== true)
      .map(describe),
  },
  {
    title: "Message list",
    bindings: bindingsFor("queue")
      .filter((b) => b.displayOnly !== true)
      .map(describe),
  },
  {
    title: "Search results",
    bindings: bindingsFor("search")
      .filter((b) => b.displayOnly !== true)
      .map(describe),
  },
  { title: "Message view", bindings: bindingsFor("message").map(describe) },
];

const SECTIONS: readonly Section[] = [...GLOBAL_SECTIONS, ...SCREEN_SECTIONS];

const KEY_COLUMN = 12;

function SectionBlock({
  section,
  width,
}: {
  readonly section: Section;
  readonly width: number;
}) {
  return (
    <Box flexDirection="column" width={width} marginBottom={1}>
      <Text bold color={theme.info}>
        {section.title}
      </Text>
      {section.bindings.map((binding) => (
        <Text key={binding.keys}>
          <Text color={theme.warning}>
            {`  ${binding.keys}`.padEnd(KEY_COLUMN)}
          </Text>
          <Text color={theme.muted}>{binding.description}</Text>
        </Text>
      ))}
    </Box>
  );
}

export interface HelpScreenProps {
  readonly width: number;
  readonly height: number;
}

/**
 * Key reference.
 *
 * Splits into two columns when the terminal is wide enough. The frame clips
 * whatever overflows, so the layout has to fit the height it is given rather
 * than relying on the terminal to scroll.
 */
export function HelpScreen({ width, height }: HelpScreenProps) {
  const twoColumn =
    width >= 80 &&
    height < SECTIONS.reduce((sum, s) => sum + s.bindings.length + 2, 1);

  if (!twoColumn) {
    return (
      <Box flexDirection="column">
        {SECTIONS.map((section) => (
          <SectionBlock key={section.title} section={section} width={width} />
        ))}
      </Box>
    );
  }

  const half = Math.ceil(SECTIONS.length / 2);
  const columnWidth = Math.floor(width / 2);

  return (
    <Box flexDirection="column">
      <Box>
        <Box flexDirection="column" width={columnWidth}>
          {SECTIONS.slice(0, half).map((section) => (
            <SectionBlock
              key={section.title}
              section={section}
              width={columnWidth}
            />
          ))}
        </Box>
        <Box flexDirection="column" width={columnWidth}>
          {SECTIONS.slice(half).map((section) => (
            <SectionBlock
              key={section.title}
              section={section}
              width={columnWidth}
            />
          ))}
        </Box>
      </Box>

      <Text color={theme.muted}>
        {glyphs.bullet} Browsing never consumes. Only purge, delete, move, and
        export-with-removal change the broker, and each asks first.
      </Text>
    </Box>
  );
}
