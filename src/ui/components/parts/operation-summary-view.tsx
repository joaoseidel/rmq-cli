import { Box } from "ink";
import type { OperationSummary } from "../../../core/domain/operation.ts";
import { formatCount } from "../../../core/util/text.ts";
import { Muted, Name, StatusMessage } from "./status-message.tsx";

export interface OperationSummaryViewProps {
  readonly summary: OperationSummary;
  /** Sentence describing what succeeded, e.g. "Requeued 3 messages to retry". */
  readonly successLabel: (count: number) => string;
  readonly failureLabel: (count: number) => string;
}

/**
 * Renders the outcome of a coordinated operation.
 *
 * The unrecovered-messages notice is the important part: when messages were
 * taken off the broker but not re-delivered, the only remaining copy is in the
 * backup file, so the operation id has to be surfaced prominently enough for the
 * user to act on it.
 */
export function OperationSummaryView({
  summary,
  successLabel,
  failureLabel,
}: OperationSummaryViewProps) {
  return (
    <Box flexDirection="column">
      {summary.successful > 0 ? (
        <StatusMessage tone="success">
          {successLabel(summary.successful)}
        </StatusMessage>
      ) : null}

      {summary.failed > 0 ? (
        <>
          <StatusMessage tone="danger">
            {failureLabel(summary.failed)}
          </StatusMessage>
          <StatusMessage tone="warning" bare>
            {formatCount(summary.unprocessedMessages.length, "message")} could
            not be re-delivered and remain saved under operation{" "}
            <Name>{summary.id}</Name>.
          </StatusMessage>
          <StatusMessage tone="muted" bare>
            Recover them from{" "}
            <Muted>~/.rmq-cli/message_backup_operations.json</Muted>.
          </StatusMessage>
        </>
      ) : null}

      {summary.successful === 0 && summary.failed === 0 ? (
        <StatusMessage tone="warning">
          No messages matched — nothing to do.
        </StatusMessage>
      ) : null}
    </Box>
  );
}
