import { Box, Text } from "ink";
import { Component, type ReactNode } from "react";
import { createLogger, logFilePath } from "../../core/util/logger.ts";
import { errorMessage } from "../../core/util/text.ts";
import { glyphs, theme } from "../theme.ts";
import { useKeyHandler } from "../hooks/use-key-handler.ts";

const logger = createLogger("ui");

const STACK_LINES = 8;

export interface ErrorBoundaryProps {
  readonly onQuit: () => void;
  readonly onRecover: () => void;
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

function Recovery({
  error,
  onRecover,
  onQuit,
}: {
  readonly error: Error;
  readonly onRecover: () => void;
  readonly onQuit: () => void;
}) {
  useKeyHandler(
    (input) => {
      if (input === "r") onRecover();
      if (input === "q") onQuit();
    },
    { isActive: true },
  );

  const stack = (error.stack ?? "")
    .split("\n")
    .slice(1, STACK_LINES + 1)
    .map((line) => line.trim());

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={theme.danger}>
        rmq hit an unexpected error
      </Text>
      <Box height={1} />
      <Text color={theme.danger}>{errorMessage(error)}</Text>
      <Box height={1} />
      {stack.map((line, index) => (
        <Text key={`${index}-${line}`} color={theme.muted}>
          {line}
        </Text>
      ))}
      <Box height={1} />
      <Text color={theme.muted}>
        The full stack was written to {logFilePath}
      </Text>
      <Text color={theme.muted}>
        Nothing on the broker was changed by this error. Any operation that was
        running is listed on the jobs screen.
      </Text>
      <Box height={1} />
      <Text>
        <Text color={theme.info}>r</Text>
        <Text color={theme.muted}> go back to the queue list </Text>
        <Text color={theme.muted}>{glyphs.bullet} </Text>
        <Text color={theme.info}>q</Text>
        <Text color={theme.muted}> quit</Text>
      </Text>
    </Box>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  override componentDidCatch(error: unknown): void {
    logger.error("Screen crashed", error);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <Recovery
        error={error}
        onRecover={() => {
          this.props.onRecover();
          this.setState({ error: null });
        }}
        onQuit={this.props.onQuit}
      />
    );
  }
}
