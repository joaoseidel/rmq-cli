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
