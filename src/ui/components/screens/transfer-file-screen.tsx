import { Box, Text } from "ink";
import { readFile, writeFile } from "node:fs/promises";
import { useState } from "react";
import { z } from "zod";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import { MessageSchema, type Message } from "../../../core/domain/message.ts";
import type { Queue } from "../../../core/domain/queue.ts";
import type { BrokerClient } from "../../../core/ports/broker.ts";
import {
  ALL_MESSAGES,
  type MessageOperations,
} from "../../../core/usecase/message-operations.ts";
import { errorMessage, formatCount } from "../../../core/util/text.ts";
import {
  useActionResult,
  useAsyncAction,
} from "../../hooks/use-async-action.ts";
import { theme } from "../../theme.ts";
import { Confirm } from "../common/confirm.tsx";
import {
  Form,
  positiveInteger,
  required,
  type FormField,
} from "../common/form.tsx";
import { Spinner } from "../parts/spinner.tsx";
import { StatusMessage } from "../parts/status-message.tsx";

export interface TransferFileScreenProps {
  readonly mode: "export" | "import";
  readonly broker: BrokerClient;
  readonly messages: MessageOperations;
  readonly connection: ConnectionInfo;
  readonly queue: Queue;
  readonly onDone: (summary: string) => void;
  readonly onCancel: () => void;
  readonly isActive: boolean;
}

const EXPORT_FIELDS: FormField[] = [
  {
    name: "file",
    label: "Save to",
    placeholder: "./messages.json",
    validate: required("A file path"),
  },
  {
    name: "scope",
    label: "How many",

    choices: [
      { value: "all", label: "everything" },
      { value: "limit", label: "a number" },
    ],
  },
  {
    name: "limit",
    label: "Limit",
    initialValue: "100",
    visible: (values) => values["scope"] === "limit",
    validate: (value, values) =>
      values["scope"] === "limit" ? positiveInteger("Limit")(value) : null,
  },
  {
    name: "ack",
    label: "After export",
    choices: [
      { value: "keep", label: "keep messages" },
      { value: "ack", label: "remove them" },
    ],
  },
];

const IMPORT_FIELDS: FormField[] = [
  {
    name: "file",
    label: "Read from",
    placeholder: "./messages.json",
    validate: required("A file path"),
  },
];

async function readExport(path: string): Promise<Message[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(`Could not read '${path}'.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`'${path}' is not valid JSON.`);
  }

  const result = z.array(MessageSchema).safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `'${path}' is not a message export: ${result.error.issues[0]?.message ?? "unexpected shape"}`,
    );
  }
  if (result.data.length === 0)
    throw new Error(`'${path}' contains no messages.`);

  return result.data as Message[];
}

export function TransferFileScreen({
  mode,
  broker,
  messages,
  connection,
  queue,
  onDone,
  onCancel,
  isActive,
}: TransferFileScreenProps) {
  const [pendingValues, setPendingValues] = useState<Record<
    string,
    string
  > | null>(null);

  const action = useAsyncAction(async (values: Record<string, string>) => {
    const path = values["file"] ?? "";

    if (mode === "export") {
      const limit =
        values["scope"] === "limit"
          ? Number(values["limit"] ?? 100)
          : ALL_MESSAGES;

      const collected = await broker.withConnection(connection, (open) =>
        messages.getMessages(queue.name, limit, values["ack"] === "ack", open),
      );

      if (collected.length === 0)
        throw new Error(`No messages found in '${queue.name}'.`);

      await writeFile(path, `${JSON.stringify(collected, null, 2)}\n`, "utf8");
      return `Exported ${formatCount(collected.length, "message")} to ${path}.`;
    }

    const incoming = await readExport(path);

    const published = await broker.withConnection(connection, async (open) => {
      let successful = 0;
      for (const message of incoming) {
        if (await messages.publishToQueue(queue.name, message.payload, open))
          successful += 1;
      }
      return successful;
    });

    const failed = incoming.length - published;
    return failed === 0
      ? `Imported ${formatCount(published, "message")} into ${queue.name}.`
      : `Imported ${published}, failed ${failed}.`;
  });

  useActionResult(action.state, onDone);

  if (action.state.status === "running") {
    return <Spinner label={mode === "export" ? "Exporting…" : "Importing…"} />;
  }

  if (pendingValues !== null) {
    return (
      <Box flexDirection="column">
        <StatusMessage tone="warning">
          Exporting with removal drains {queue.name}. The messages will only
          exist in {pendingValues["file"]}.
        </StatusMessage>
        <Confirm
          message={`Export ${
            pendingValues["scope"] === "limit"
              ? `up to ${pendingValues["limit"]} messages`
              : "every message"
          } and remove them from '${queue.name}'?`}
          isActive={isActive}
          onAnswer={(confirmed) => {
            const values = pendingValues;
            setPendingValues(null);
            if (confirmed) action.run(values);
          }}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.muted}>
        {mode === "export"
          ? `Reading from ${queue.name}. Messages stay in the queue unless you choose otherwise.`
          : `Publishing into ${queue.name}. The file is validated before anything is sent.`}
      </Text>
      <Box height={1} />

      {action.state.status === "failure" ? (
        <Box marginBottom={1}>
          <StatusMessage tone="danger">
            {errorMessage(action.state.error)}
          </StatusMessage>
        </Box>
      ) : null}

      <Form
        fields={mode === "export" ? EXPORT_FIELDS : IMPORT_FIELDS}
        isActive={isActive}
        submitLabel={mode}
        onCancel={onCancel}
        onSubmit={(values) => {
          if (mode === "export" && values["ack"] === "ack")
            setPendingValues(values);
          else action.run(values);
        }}
      />
    </Box>
  );
}
