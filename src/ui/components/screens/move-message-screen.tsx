import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import { displayExchange, type Message } from "../../../core/domain/message.ts";
import type { Queue } from "../../../core/domain/queue.ts";
import type { BrokerClient } from "../../../core/ports/broker.ts";
import type {
  MessageOperations,
  RemovalOutcome,
} from "../../../core/usecase/message-operations.ts";
import { errorMessage, formatCount } from "../../../core/util/text.ts";
import { useAsyncAction } from "../../hooks/use-async-action.ts";
import { useQueueNames } from "../../hooks/use-queue-names.ts";
import { glyphs, theme } from "../../theme.ts";
import { toSingleLine, truncateToWidth } from "../../utils/width.ts";
import { Confirm } from "../common/confirm.tsx";
import { Form, mustBeKnown, type FormField } from "../common/form.tsx";
import { Spinner } from "../parts/spinner.tsx";
import { Muted, Name, StatusMessage } from "../parts/status-message.tsx";

export type MoveMode = "move" | "reprocess";

export interface MoveMessageScreenProps {
  readonly mode: MoveMode;
  readonly broker: BrokerClient;
  readonly operations: MessageOperations;
  readonly connection: ConnectionInfo;
  readonly queue: Queue;
  readonly messages: readonly Message[];
  readonly onDone: (summary: string, tone: "success" | "danger") => void;
  readonly onCancel: () => void;
  readonly isActive: boolean;
}

function moveFields(queueNames: readonly string[]): FormField[] {
  return [
    {
      name: "to",
      label: "To queue",
      suggestions: queueNames,
      validate: mustBeKnown("Destination queue", queueNames),
    },
  ];
}

function describe(
  mode: MoveMode,
  messages: readonly Message[],
  queue: Queue,
  destination: string,
): string {
  const what =
    messages.length === 1
      ? "this message"
      : formatCount(messages.length, "message");

  if (mode === "move") {
    return `Move ${what} from '${queue.name}' to '${destination}'?`;
  }

  const exchanges = new Set(messages.map(displayExchange));
  const where =
    exchanges.size === 1
      ? `'${[...exchanges][0]}'`
      : `${exchanges.size} exchanges`;

  return `Republish ${what} to ${where} and remove ${messages.length === 1 ? "it" : "them"} from '${queue.name}'?`;
}

export function MoveMessageScreen({
  mode,
  broker,
  operations,
  connection,
  queue,
  messages,
  onDone,
  onCancel,
  isActive,
}: MoveMessageScreenProps) {
  const [destination, setDestination] = useState<string | null>(
    mode === "reprocess" ? "" : null,
  );
  const queueNames = useQueueNames(broker, connection);

  const action = useAsyncAction(
    async (target: string): Promise<RemovalOutcome> =>
      broker.withConnection(connection, (open) =>
        mode === "move"
          ? operations.safeMoveMessages({
              messages,
              fromQueue: queue.name,
              toQueue: target,
              connection: open,
            })
          : operations.safeReprocessMessages({
              messages,
              fromQueue: queue.name,
              connection: open,
            }),
      ),
  );

  const outcome = action.state.status === "success" ? action.state.data : null;
  const error = action.state.status === "failure" ? action.state.error : null;

  useEffect(() => {
    if (outcome === null) return;

    if (outcome.lost > 0) {
      onDone(
        `${outcome.removed} moved, but ${formatCount(outcome.lost, "message")} could not be put back, ` +
          `saved under operation ${outcome.operationId}.`,
        "danger",
      );
      return;
    }

    onDone(
      mode === "move"
        ? `Moved ${formatCount(outcome.removed, "message")} out of ${queue.name}${outcome.restored > 0 ? `, ${formatCount(outcome.restored, "message")} left untouched` : ""}.`
        : `Reprocessed ${formatCount(outcome.removed, "message")} from ${queue.name}.`,
      "success",
    );
  }, [outcome, onDone, mode, queue.name]);

  useEffect(() => {
    if (error !== null) onDone(errorMessage(error), "danger");
  }, [error, onDone]);

  if (action.state.status === "running") {
    return (
      <Spinner
        label={
          mode === "move"
            ? `Moving ${formatCount(messages.length, "message")}…`
            : `Reprocessing ${formatCount(messages.length, "message")}…`
        }
      />
    );
  }

  const shown = messages.slice(0, 4);

  const preview = (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.muted}>
        {glyphs.bullet} {formatCount(messages.length, "message")} from{" "}
        {queue.name}
      </Text>
      {shown.map((entry) => (
        <Text key={entry.id}>
          {"  "}
          <Muted>
            {displayExchange(entry)} {glyphs.arrowRight} {entry.routingKey}
            {"  "}
            {truncateToWidth(toSingleLine(entry.payload), 80)}
          </Muted>
        </Text>
      ))}
      {messages.length > shown.length ? (
        <Text color={theme.muted}>
          {"  "}… and {messages.length - shown.length} more
        </Text>
      ) : null}
    </Box>
  );

  if (destination === null) {
    return (
      <Box flexDirection="column">
        {preview}
        <Form
          fields={moveFields(queueNames)}
          isActive={isActive}
          submitLabel="review"
          onCancel={onCancel}
          onSubmit={(values) => setDestination(values["to"] ?? "")}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {preview}
      <StatusMessage tone="warning">
        {queue.name} will be drained and restored so this one message can be
        taken out. Every other message goes back.
      </StatusMessage>
      <Confirm
        message={describe(mode, messages, queue, destination)}
        isActive={isActive}
        onAnswer={(confirmed) => {
          if (confirmed) action.run(destination);
          else if (mode === "move") setDestination(null);
          else onCancel();
        }}
      />
      {mode === "move" ? (
        <Text color={theme.muted}>
          Destination: <Name>{destination}</Name>
        </Text>
      ) : null}
    </Box>
  );
}
