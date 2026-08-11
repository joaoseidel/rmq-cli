import { Box, Text } from "ink";
import { displayExchange, type Message } from "../../../core/domain/message.ts";
import { borders, theme } from "../../theme.ts";
import { displayWidth } from "../../utils/width.ts";

/** Pretty-prints a JSON payload; returns the original text when it is not JSON. */
function formatPayload(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return payload;

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return payload;
  }
}

/**
 * The payload as displayed lines, after any JSON re-indentation.
 *
 * Formatting is the expensive part — a parse and a re-serialise of the whole
 * body — so the caller does it once and holds the result, rather than every
 * component that needs a line count redoing it on each keystroke.
 */
export function formatPayloadLines(payload: string): string[] {
  return formatPayload(payload).split("\n");
}

/**
 * Slices the formatted payload to a window of lines.
 *
 * Ink has no scrollable viewport, so a long payload has to be cut down before it
 * is rendered — otherwise it simply overflows the terminal and pushes the rest
 * of the screen out of view.
 */
function windowPayload(
  lines: readonly string[],
  window: { offset: number; height: number } | undefined,
): string {
  if (window === undefined) return lines.join("\n");

  const start = Math.max(
    0,
    Math.min(window.offset, Math.max(0, lines.length - window.height)),
  );
  return lines.slice(start, start + window.height).join("\n");
}

function Field({
  label,
  value,
  width,
}: {
  readonly label: string;
  readonly value: string;
  readonly width: number;
}) {
  return (
    <Box>
      <Text color={theme.muted}>{label.padEnd(width)} </Text>
      <Text>{value}</Text>
    </Box>
  );
}

export interface MessageDetailProps {
  readonly message: Message;
  /** The formatted payload, already split into lines by {@link formatPayloadLines}. */
  readonly payloadLines: readonly string[];
  readonly width: number;
  /** Renders headers and properties as well as the core fields. */
  readonly verbose?: boolean;
  /** Limits the payload to a window of lines. Omit to render it in full. */
  readonly payloadWindow?: { readonly offset: number; readonly height: number };
}

/**
 * Full single-message view.
 *
 * JSON payloads are re-indented because inspecting a message almost always means
 * reading its body, and a single-line blob of JSON is the one thing the previous
 * table-based output made hardest.
 */
export function MessageDetail({
  message,
  payloadLines,
  width,
  verbose = true,
  payloadWindow,
}: MessageDetailProps) {
  const entries: [string, string][] = [
    ["ID", message.id],
    ["Transport", message.transport],
    ["Exchange", displayExchange(message)],
    ["Routing key", message.routingKey],
  ];

  const labelWidth = Math.max(...entries.map(([label]) => displayWidth(label)));
  const rule = borders.horizontal.repeat(Math.max(10, width));

  const headers = Object.entries(message.headers);
  const properties = Object.entries(message.properties);

  return (
    <Box flexDirection="column">
      {entries.map(([label, value]) => (
        <Field key={label} label={label} value={value} width={labelWidth} />
      ))}

      {verbose && properties.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.muted}>Properties</Text>
          {properties.map(([key, value]) => (
            <Text key={key}>
              {"  "}
              <Text color={theme.muted}>{key}: </Text>
              {value}
            </Text>
          ))}
        </Box>
      ) : null}

      {verbose && headers.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.muted}>Headers</Text>
          {headers.map(([key, value]) => (
            <Text key={key}>
              {"  "}
              <Text color={theme.muted}>{key}: </Text>
              {value}
            </Text>
          ))}
        </Box>
      ) : null}

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.border}>{rule}</Text>
        <Text>{windowPayload(payloadLines, payloadWindow)}</Text>
      </Box>
    </Box>
  );
}
