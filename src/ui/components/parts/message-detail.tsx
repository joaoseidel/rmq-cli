import { Box, Text } from "ink";
import { displayExchange, type Message } from "../../../core/domain/message.ts";
import { borders, theme } from "../../theme.ts";
import {
  displayWidth,
  truncateToWidth,
  wrapToWidth,
} from "../../utils/width.ts";

function formatPayload(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return payload;

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return payload;
  }
}

export function formatPayloadLines(payload: string, width: number): string[] {
  return formatPayload(payload)
    .split("\n")
    .flatMap((line) => wrapToWidth(line, width));
}

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

function entryValueWidth(key: string, width: number): number {
  return Math.max(4, width - displayWidth(key) - 4);
}

function Field({
  label,
  value,
  labelWidth,
  width,
}: {
  readonly label: string;
  readonly value: string;
  readonly labelWidth: number;
  readonly width: number;
}) {
  return (
    <Box>
      <Text color={theme.muted}>{label.padEnd(labelWidth)} </Text>
      <Text>{truncateToWidth(value, Math.max(4, width - labelWidth - 1))}</Text>
    </Box>
  );
}

export interface MessageDetailProps {
  readonly message: Message;
  readonly payloadLines: readonly string[];
  readonly width: number;
  readonly verbose?: boolean;
  readonly payloadWindow?: { readonly offset: number; readonly height: number };
}

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
        <Field
          key={label}
          label={label}
          value={value}
          labelWidth={labelWidth}
          width={width}
        />
      ))}

      {verbose && properties.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.muted}>Properties</Text>
          {properties.map(([key, value]) => (
            <Text key={key}>
              {"  "}
              <Text color={theme.muted}>{key}: </Text>
              {truncateToWidth(value, entryValueWidth(key, width))}
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
              {truncateToWidth(value, entryValueWidth(key, width))}
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
