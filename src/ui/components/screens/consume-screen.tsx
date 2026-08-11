import { Box, Text } from "ink";
import { useEffect, useRef, useState } from "react";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import { displayExchange, type Message } from "../../../core/domain/message.ts";
import type { Queue } from "../../../core/domain/queue.ts";
import type { BrokerClient } from "../../../core/ports/broker.ts";
import type { QueueOperations } from "../../../core/usecase/queue-operations.ts";
import { errorMessage, formatCount } from "../../../core/util/text.ts";
import { useScreenKeys } from "../../hooks/use-screen-keys.ts";
import { glyphs, theme } from "../../theme.ts";
import { truncateToWidth } from "../../utils/width.ts";
import { Spinner } from "../parts/spinner.tsx";
import { StatusMessage } from "../parts/status-message.tsx";

const BUFFER_SIZE = 500;

const PREFETCH = 100;

const FLUSH_INTERVAL_MS = 100;

type ConsumerStatus =
  | { readonly kind: "starting" }
  | { readonly kind: "running" }
  | { readonly kind: "error"; readonly message: string };

export interface ConsumeScreenProps {
  readonly broker: BrokerClient;
  readonly queues: QueueOperations;
  readonly connection: ConnectionInfo;
  readonly queue: Queue;
  readonly acknowledge: boolean;
  readonly width: number;
  readonly height: number;
  readonly isActive: boolean;
}

interface Entry {
  readonly index: number;
  readonly message: Message;
  readonly at: Date;
}

function timestamp(date: Date): string {
  return date.toTimeString().slice(0, 8);
}

export function ConsumeScreen({
  broker,
  queues,
  connection,
  queue,
  acknowledge,
  width,
  height,
  isActive,
}: ConsumeScreenProps) {
  const [entries, setEntries] = useState<Entry[]>([]);

  const [status, setStatus] = useState<ConsumerStatus>({ kind: "starting" });
  const [paused, setPaused] = useState(false);

  const counter = useRef(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const buffered = useRef<Entry[]>([]);

  useEffect(() => {
    let stopped = false;
    let release = () => {};

    const flush = setInterval(() => {
      if (buffered.current.length === 0) return;
      const batch = buffered.current;
      buffered.current = [];
      setEntries((current) => [...current, ...batch].slice(-BUFFER_SIZE));
    }, FLUSH_INTERVAL_MS);

    const finished = new Promise<void>((resolve) => {
      release = resolve;
    });

    const stop = () => {
      if (stopped) return;
      stopped = true;
      release();
    };

    void broker
      .withConnection(connection, async (open) => {
        const consumerTag = await queues.consumeMessages({
          queueName: queue.name,
          autoAck: acknowledge,
          prefetchCount: PREFETCH,
          connection: open,
          onMessage: (message) => {
            counter.current += 1;

            if (pausedRef.current) return;

            buffered.current.push({
              index: counter.current,
              message,
              at: new Date(),
            });
          },
          onCancel: stop,
        });

        setStatus({ kind: "running" });
        await finished;
        await queues.cancelConsumer(consumerTag, open);
      })
      .catch((cause: unknown) => {
        setStatus({ kind: "error", message: errorMessage(cause) });
      });

    return () => {
      clearInterval(flush);
      stop();
    };
  }, [broker, queues, connection, queue.name, acknowledge]);

  useScreenKeys("consume", () => {}, {
    isActive,
    local: {
      " ": () => setPaused((value) => !value),
      x: () => {
        buffered.current = [];
        setEntries([]);
      },
    },
  });

  if (status.kind === "error") {
    return (
      <Box flexDirection="column">
        <StatusMessage tone="danger">{status.message}</StatusMessage>
        <StatusMessage tone="muted" bare>
          Live consumption needs an AMQP connection; the HTTP management API
          cannot stream.
        </StatusMessage>
      </Box>
    );
  }

  const visible = entries.slice(-Math.max(1, Math.floor((height - 1) / 2)));

  return (
    <Box flexDirection="column">
      {status.kind === "starting" ? (
        <Spinner label={`Attaching to ${queue.name}…`} />
      ) : (
        <Text color={theme.muted}>
          {paused ? (
            <Text color={theme.warning}>paused</Text>
          ) : (
            <Text color={theme.success}>live</Text>
          )}{" "}
          {glyphs.bullet} {formatCount(counter.current, "message")} seen{" "}
          {glyphs.bullet}{" "}
          {acknowledge
            ? "acknowledging (messages are removed)"
            : "peeking (messages stay queued)"}
        </Text>
      )}

      {visible.map((entry) => (
        <Box key={entry.index} flexDirection="column">
          <Text>
            <Text color={theme.success}>{glyphs.check} </Text>
            <Text color={theme.muted}>
              {timestamp(entry.at)} #{entry.index} {glyphs.bullet}{" "}
              {displayExchange(entry.message)} {glyphs.arrowRight}{" "}
              {entry.message.routingKey}
            </Text>
          </Text>
          <Text>
            {"  "}
            {truncateToWidth(entry.message.payload, Math.max(20, width - 2))}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
