import { Box, Text } from "ink";
import { readFile } from "node:fs/promises";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import type { BrokerClient } from "../../../core/ports/broker.ts";
import type { MessageOperations } from "../../../core/usecase/message-operations.ts";
import { errorMessage } from "../../../core/util/text.ts";
import {
  useActionResult,
  useAsyncAction,
} from "../../hooks/use-async-action.ts";
import { useQueueNames } from "../../hooks/use-queue-names.ts";
import { theme } from "../../theme.ts";
import {
  Form,
  mustBeKnown,
  required,
  type FormField,
} from "../common/form.tsx";
import { Spinner } from "../parts/spinner.tsx";
import { StatusMessage } from "../parts/status-message.tsx";

export interface PublishScreenProps {
  readonly broker: BrokerClient;
  readonly messages: MessageOperations;
  readonly connection: ConnectionInfo;
  readonly queueName?: string;
  readonly onDone: (summary: string) => void;
  readonly onCancel: () => void;
  readonly isActive: boolean;
}

function buildFields(
  queueName: string | undefined,
  queueNames: readonly string[],
): FormField[] {
  return [
    {
      name: "target",
      label: "Send to",
      choices: [
        { value: "queue", label: "queue" },
        { value: "exchange", label: "exchange" },
      ],
    },
    {
      name: "queue",
      label: "Queue",
      initialValue: queueName ?? "",
      suggestions: queueNames,
      visible: (values) => values["target"] === "queue",
      validate: mustBeKnown("Queue name", queueNames),
    },
    {
      name: "exchange",
      label: "Exchange",
      visible: (values) => values["target"] === "exchange",
      validate: required("Exchange name"),
    },
    {
      name: "routingKey",
      label: "Routing key",
      visible: (values) => values["target"] === "exchange",
      validate: required("Routing key"),
    },
    {
      name: "source",
      label: "Body from",
      choices: [
        { value: "inline", label: "typed" },
        { value: "file", label: "file" },
      ],
    },
    {
      name: "payload",
      label: "Payload",
      placeholder: '{"key":"value"}',
      visible: (values) => values["source"] === "inline",
      validate: (value, values) =>
        values["source"] === "inline" && value.trim() === ""
          ? "Payload is required."
          : null,
    },
    {
      name: "file",
      label: "File path",
      placeholder: "./message.json",
      visible: (values) => values["source"] === "file",
      validate: (value, values) =>
        values["source"] === "file" && value.trim() === ""
          ? "File path is required."
          : null,
    },
  ];
}

export function PublishScreen({
  broker,
  messages,
  connection,
  queueName,
  onDone,
  onCancel,
  isActive,
}: PublishScreenProps) {
  const queueNames = useQueueNames(broker, connection);

  const publish = useAsyncAction(async (values: Record<string, string>) => {
    const payload =
      values["source"] === "file"
        ? await readFile(values["file"] ?? "", "utf8").catch(() => {
            throw new Error(`Could not read '${values["file"]}'.`);
          })
        : (values["payload"] ?? "");

    return broker.withConnection(connection, async (open) => {
      const published =
        values["target"] === "queue"
          ? await messages.publishToQueue(values["queue"] ?? "", payload, open)
          : await messages.publishToExchange(
              values["exchange"] ?? "",
              values["routingKey"] ?? "",
              payload,
              open,
            );

      if (!published) {
        throw new Error(
          values["target"] === "queue"
            ? `Failed to publish to queue '${values["queue"]}'. Check that it exists.`
            : `Failed to publish to '${values["exchange"]}'. Check the exchange exists and the routing key binds.`,
        );
      }

      return values["target"] === "queue"
        ? `Published to queue ${values["queue"]}.`
        : `Published to ${values["exchange"]} with routing key ${values["routingKey"]}.`;
    });
  });

  useActionResult(publish.state, onDone);

  if (publish.state.status === "running")
    return <Spinner label="Publishing…" />;

  return (
    <Box flexDirection="column">
      <Text color={theme.muted}>
        Publishing to {connection.name}, vhost {connection.vHost.name}.
      </Text>
      <Box height={1} />

      {publish.state.status === "failure" ? (
        <Box marginBottom={1}>
          <StatusMessage tone="danger">
            {errorMessage(publish.state.error)}
          </StatusMessage>
        </Box>
      ) : null}

      <Form
        fields={buildFields(queueName, queueNames)}
        isActive={isActive}
        submitLabel="publish"
        onCancel={onCancel}
        onSubmit={publish.run}
      />
    </Box>
  );
}
