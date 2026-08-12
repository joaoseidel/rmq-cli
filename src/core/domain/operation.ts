import type { Message } from "./message.ts";

export type ProcessingResult =
  | { readonly status: "success"; readonly messageId: string }
  | {
      readonly status: "failure";
      readonly messageId: string;
      readonly reason: string;
    };

export function success(messageId: string): ProcessingResult {
  return { status: "success", messageId };
}

export function failure(messageId: string, reason: string): ProcessingResult {
  return { status: "failure", messageId, reason };
}

export interface BackupOrigin {
  readonly queueName: string;
  readonly connectionId: string;
  readonly vhost: string;
}

export interface InterruptedOperation {
  readonly id: string;
  readonly type: string;
  readonly origin: BackupOrigin;
  readonly createdAt: number;
  readonly total: number;
  readonly remaining: number;
  readonly recoverable: boolean;
}

export function sameOrigin(left: BackupOrigin, right: BackupOrigin): boolean {
  return (
    left.connectionId === right.connectionId &&
    left.vhost === right.vhost &&
    left.queueName === right.queueName
  );
}

export function isRecoverable(origin: BackupOrigin): boolean {
  return origin.queueName !== "" && origin.connectionId !== "";
}

export interface OperationProgress {
  readonly phase: string;
  readonly done: number;
  readonly total: number;
}

export type ProgressReporter = (progress: OperationProgress) => void;

export interface OperationSummary {
  readonly id: string;
  readonly successful: number;
  readonly failed: number;
  readonly processedMessages: readonly Message[];
  readonly unprocessedMessages: readonly Message[];
}

export function emptySummary(
  id: string,
  unprocessedMessages: readonly Message[] = [],
): OperationSummary {
  return {
    id,
    successful: 0,
    failed: 0,
    processedMessages: [],
    unprocessedMessages,
  };
}
