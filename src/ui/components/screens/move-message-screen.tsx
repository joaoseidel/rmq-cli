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
import { glyphs, theme } from "../../theme.ts";
import { toSingleLine, truncateToWidth } from "../../utils/width.ts";
import { Confirm } from "../common/confirm.tsx";
import { Form, required, type FormField } from "../common/form.tsx";
import { Spinner } from "../parts/spinner.tsx";
import { Muted, Name, StatusMessage } from "../parts/status-message.tsx";

export type MoveMode = "move" | "reprocess";

export interface MoveMessageScreenProps {
  readonly mode: MoveMode;
  readonly broker: BrokerClient;
  readonly messages: MessageOperations;
  readonly connection: ConnectionInfo;
  readonly queue: Queue;
  readonly message: Message;
  readonly onDone: (summary: string, tone: "success" | "danger") => void;
  readonly onCancel: () => void;
  readonly isActive: boolean;
}

const MOVE_FIELDS: FormField[] = [
  {
    name: "to",
    label: "To queue",
    placeholder: "retry-queue",
    validate: required("Destination queue"),
  },
];

/** One line describing what is about to happen, for the confirmation. */
function describe(
  mode: MoveMode,
  message: Message,
  queue: Queue,
  destination: string,
): string {
  return mode === "move"
    ? `Move this message from '${queue.name}' to '${destination}'?`
    : `Republish this message to '${displayExchange(message)}' and remove it from '${queue.name}'?`;
}

/**
 * Moves or reprocesses a single message, with the message itself on screen.
 *
 * Both operations publish a copy and then remove the original, which means
 * draining and restoring the source queue. The confirmation says so, and the
 * result reports what came back — a silent "done" would be untrustworthy for an
 * operation that briefly holds an entire queue in memory.
 */
export function MoveMessageScreen({
  mode,
  broker,
  messages,
  connection,
  queue,
  message,
  onDone,
  onCancel,
  isActive,
}: MoveMessageScreenProps) {
  const [destination, setDestination] = useState<string | null>(
    mode === "reprocess" ? "" : null,
  );

  const action = useAsyncAction(
    async (target: string): Promise<RemovalOutcome> =>
      broker.withConnection(connection, (open) =>
        mode === "move"
          ? messages.safeRequeueMessage({
              message,
              fromQueue: queue.name,
              toQueue: target,
              connection: open,
            })
          : messages.safeReprocessMessage({
              message,
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
        `${outcome.removed} moved, but ${formatCount(outcome.lost, "message")} could not be put back — ` +
          `saved under operation ${outcome.operationId}.`,
        "danger",
      );
      return;
    }

    onDone(
      mode === "move"
        ? `Moved 1 message out of ${queue.name}${outcome.restored > 0 ? `, ${formatCount(outcome.restored, "message")} left untouched` : ""}.`
        : `Reprocessed 1 message from ${queue.name}.`,
      "success",
    );
  }, [outcome, onDone, mode, queue.name]);

  useEffect(() => {
    if (error !== null) onDone(errorMessage(error), "danger");
  }, [error, onDone]);

  if (action.state.status === "running") {
    return (
      <Spinner
        label={mode === "move" ? "Moving the message…" : "Reprocessing…"}
      />
    );
  }

  const preview = (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.muted}>
        {glyphs.bullet} {message.id}
      </Text>
      <Text color={theme.muted}>
        {glyphs.bullet} {displayExchange(message)} {glyphs.arrowRight}{" "}
        {message.routingKey}
      </Text>
      <Text>
        {"  "}
        <Muted>{truncateToWidth(toSingleLine(message.payload), 100)}</Muted>
      </Text>
    </Box>
  );

  // Reprocess has no destination to pick, so it goes straight to the prompt.
  if (destination === null) {
    return (
      <Box flexDirection="column">
        {preview}
        <Form
          fields={MOVE_FIELDS}
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
        message={describe(mode, message, queue, destination)}
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
