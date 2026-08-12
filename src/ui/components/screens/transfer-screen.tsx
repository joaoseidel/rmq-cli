import { Box, Text } from "ink";
import { useState } from "react";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import { totalMessages, type Queue } from "../../../core/domain/queue.ts";
import type { BrokerClient } from "../../../core/ports/broker.ts";
import type { JobManager } from "../../../core/usecase/jobs.ts";
import { ALL_MESSAGES } from "../../../core/usecase/message-operations.ts";
import {
  listNames,
  totalsOf,
  type QueueOperations,
} from "../../../core/usecase/queue-operations.ts";
import { formatCount } from "../../../core/util/text.ts";
import { useQueueNames } from "../../hooks/use-queue-names.ts";
import { glyphs, theme } from "../../theme.ts";
import { Confirm } from "../common/confirm.tsx";
import {
  Form,
  mustBeKnown,
  positiveInteger,
  type FormField,
} from "../common/form.tsx";
import { StatusMessage } from "../parts/status-message.tsx";

export interface TransferScreenProps {
  readonly broker: BrokerClient;
  readonly queues: QueueOperations;
  readonly jobs: JobManager;
  readonly connection: ConnectionInfo;
  readonly sources?: readonly Queue[];
  readonly onDone: (summary: string) => void;
  readonly onCancel: () => void;
  readonly isActive: boolean;
}

interface Plan {
  readonly from: readonly string[];
  readonly to: string;
  readonly limit: number;
}

const PREVIEWED = 4;

function buildFields(
  sources: readonly Queue[],
  queueNames: readonly string[],
): FormField[] {
  const fixed = sources.map((queue) => queue.name);
  const asks = fixed.length > 1;

  return [
    ...(asks
      ? []
      : [
          {
            name: "from",
            label: "From queue",
            initialValue: fixed[0] ?? "",
            suggestions: queueNames,
            validate: mustBeKnown("Source queue", queueNames),
          },
        ]),
    {
      name: "to",
      label: "To queue",
      suggestions: queueNames,
      validate: (value: string, values: Record<string, string>) => {
        const from = asks ? fixed : [values["from"] ?? ""];
        if (from.includes(value.trim())) {
          return asks
            ? `'${value.trim()}' is one of the queues being moved. Pick another destination.`
            : "Source and destination must differ.";
        }
        return mustBeKnown("Destination queue", queueNames)(value);
      },
    },
    {
      name: "scope",
      label: asks ? "How many each" : "How many",
      choices: [
        { value: "limit", label: "a number" },
        { value: "all", label: "everything" },
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
  ];
}

function describeAmount(plan: Plan): string {
  const each = plan.from.length > 1 ? " from each" : "";

  return plan.limit === ALL_MESSAGES
    ? `Every message${each}`
    : `Up to ${formatCount(plan.limit, "message")}${each}`;
}

export function TransferScreen({
  broker,
  queues,
  jobs,
  connection,
  sources = [],
  onDone,
  onCancel,
  isActive,
}: TransferScreenProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const queueNames = useQueueNames(broker, connection);

  const start = (target: Plan) => {
    const what =
      target.limit === ALL_MESSAGES
        ? "every message"
        : formatCount(target.limit, "message");

    const from =
      target.from.length === 1
        ? target.from[0]
        : `each of ${formatCount(target.from.length, "queue")}`;

    const title = `Moving ${what} from ${from} to ${target.to}`;

    jobs.start({
      kind: "transfer",
      title,
      run: async (job) => {
        const outcomes = await broker.withConnection(connection, (open) =>
          queues.safeRequeueQueues({
            fromQueues: target.from,
            toQueue: target.to,
            limit: target.limit,
            connection: open,
            onProgress: job.report,
            throwIfCancelled: job.throwIfCancelled,
          }),
        );

        const { successful, failed } = totalsOf(outcomes);

        if (failed > 0) {
          const stuck = outcomes.filter((outcome) => outcome.summary.failed > 0);
          return (
            `Moved ${successful} to ${target.to}, ${failed} failed from ` +
            `${listNames(stuck.map((outcome) => outcome.queue))}. ` +
            `Backed up as ${stuck.map((outcome) => outcome.summary.id).join(", ")}.`
          );
        }

        return `Moved ${formatCount(successful, "message")} to ${target.to}.`;
      },
    });

    onDone(`${title}… press J to watch it.`);
  };

  if (plan !== null) {
    const shown = plan.from.slice(0, PREVIEWED);
    const depths = new Map(
      sources.map((queue) => [queue.name, totalMessages(queue)]),
    );

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.muted}>
            {describeAmount(plan)} will be taken from{" "}
            {plan.from.length === 1
              ? plan.from[0]
              : formatCount(plan.from.length, "queue")}{" "}
            and published to {plan.to}.
          </Text>
          {plan.from.length === 1
            ? null
            : shown.map((name) => (
                <Text key={name} color={theme.muted}>
                  {"  "}
                  {glyphs.bullet} {name}
                  {depths.has(name)
                    ? ` (${formatCount(depths.get(name) ?? 0, "message")})`
                    : ""}
                </Text>
              ))}
          {plan.from.length > shown.length ? (
            <Text color={theme.muted}>
              {"  "}… and {plan.from.length - shown.length} more
            </Text>
          ) : null}
        </Box>

        <StatusMessage tone="warning">
          Each queue is drained and backed up on its own, so a queue that fails
          leaves the ones already moved alone.
        </StatusMessage>
        <Confirm
          message="Proceed?"
          isActive={isActive}
          onAnswer={(confirmed) => {
            if (confirmed) start(plan);
            else setPlan(null);
          }}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.muted}>
        Messages are backed up before the move, so nothing is lost if it fails.
      </Text>
      {sources.length > 1 ? (
        <Text color={theme.muted}>
          Moving from {formatCount(sources.length, "queue")}:{" "}
          {listNames(
            sources.map((queue) => queue.name),
            PREVIEWED,
          )}
        </Text>
      ) : null}
      <Box height={1} />

      <Form
        fields={buildFields(sources, queueNames)}
        isActive={isActive}
        submitLabel="review"
        onCancel={onCancel}
        onSubmit={(values) =>
          setPlan({
            from:
              sources.length > 1
                ? sources.map((queue) => queue.name)
                : [values["from"] ?? ""],
            to: values["to"] ?? "",
            limit:
              values["scope"] === "all"
                ? ALL_MESSAGES
                : Number(values["limit"] ?? 100),
          })
        }
      />
    </Box>
  );
}
