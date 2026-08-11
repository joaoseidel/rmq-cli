import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import type { OperationSummary } from "../../../core/domain/operation.ts";
import type { BrokerClient } from "../../../core/ports/broker.ts";
import { ALL_MESSAGES } from "../../../core/usecase/message-operations.ts";
import type { QueueOperations } from "../../../core/usecase/queue-operations.ts";
import { errorMessage, formatCount } from "../../../core/util/text.ts";
import { useAsyncAction } from "../../hooks/use-async-action.ts";
import { useQueueNames } from "../../hooks/use-queue-names.ts";
import { theme } from "../../theme.ts";
import { Confirm } from "../common/confirm.tsx";
import {
  Form,
  mustBeKnown,
  positiveInteger,
  type FormField,
} from "../common/form.tsx";
import { OperationSummaryView } from "../parts/operation-summary-view.tsx";
import { Spinner } from "../parts/spinner.tsx";
import { StatusMessage } from "../parts/status-message.tsx";

export interface TransferScreenProps {
  readonly broker: BrokerClient;
  readonly queues: QueueOperations;
  readonly connection: ConnectionInfo;
  readonly fromQueue?: string;
  readonly onDone: (summary: string) => void;
  readonly onCancel: () => void;
  readonly isActive: boolean;
}

interface Plan {
  readonly from: string;
  readonly to: string;
  readonly limit: number;
}

function buildFields(
  fromQueue: string | undefined,
  queueNames: readonly string[],
): FormField[] {
  return [
    {
      name: "from",
      label: "From queue",
      initialValue: fromQueue ?? "",
      suggestions: queueNames,
      validate: mustBeKnown("Source queue", queueNames),
    },
    {
      name: "to",
      label: "To queue",
      suggestions: queueNames,
      validate: (value, values) => {
        if (value === values["from"])
          return "Source and destination must differ.";
        return mustBeKnown("Destination queue", queueNames)(value);
      },
    },
    {
      name: "scope",
      label: "How many",
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

export function TransferScreen({
  broker,
  queues,
  connection,
  fromQueue,
  onDone,
  onCancel,
  isActive,
}: TransferScreenProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const queueNames = useQueueNames(broker, connection);

  const transfer = useAsyncAction(
    async (target: Plan): Promise<OperationSummary> =>
      broker.withConnection(connection, (open) =>
        queues.safeRequeueMessages({
          fromQueue: target.from,
          toQueue: target.to,
          limit: target.limit,
          connection: open,
        }),
      ),
  );

  const summary =
    transfer.state.status === "success" ? transfer.state.data : null;

  useEffect(() => {
    if (summary === null) return;
    onDone(
      summary.failed > 0
        ? `Moved ${summary.successful}, failed ${summary.failed}. Operation ${summary.id}.`
        : `Moved ${formatCount(summary.successful, "message")}.`,
    );
  }, [summary, onDone]);

  if (transfer.state.status === "running")
    return <Spinner label="Moving messages…" />;

  if (transfer.state.status === "success") {
    return (
      <OperationSummaryView
        summary={transfer.state.data}
        successLabel={(count) =>
          `Moved ${formatCount(count, "message")} to ${plan?.to ?? ""}.`
        }
        failureLabel={(count) =>
          `Failed to move ${formatCount(count, "message")}.`
        }
      />
    );
  }

  if (plan !== null) {
    return (
      <Box flexDirection="column">
        <StatusMessage tone="warning">
          {plan.limit === ALL_MESSAGES
            ? "Every message"
            : formatCount(plan.limit, "message")}{" "}
          will be taken from {plan.from} and published to {plan.to}.
        </StatusMessage>
        <Confirm
          message="Proceed?"
          isActive={isActive}
          onAnswer={(confirmed) => {
            if (confirmed) transfer.run(plan);
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
      <Box height={1} />

      {transfer.state.status === "failure" ? (
        <Box marginBottom={1}>
          <StatusMessage tone="danger">
            {errorMessage(transfer.state.error)}
          </StatusMessage>
        </Box>
      ) : null}

      <Form
        fields={buildFields(fromQueue, queueNames)}
        isActive={isActive}
        submitLabel="review"
        onCancel={onCancel}
        onSubmit={(values) =>
          setPlan({
            from: values["from"] ?? "",
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
