import { Box, Text } from "ink";
import { useEffect, useRef, useState } from "react";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import { displayExchange, type Message } from "../../../core/domain/message.ts";
import type { Queue } from "../../../core/domain/queue.ts";
import type { BrokerClient } from "../../../core/ports/broker.ts";
import type { QueueOperations } from "../../../core/usecase/queue-operations.ts";
import { errorMessage, formatCount } from "../../../core/util/text.ts";
import { useKeyHandler } from "../../hooks/use-key-handler.ts";
import { glyphs, theme } from "../../theme.ts";
import { truncateToWidth } from "../../utils/width.ts";
import { Spinner } from "../parts/spinner.tsx";
import { StatusMessage } from "../parts/status-message.tsx";

/** Delivered messages kept on screen. Older ones are dropped. */
const BUFFER_SIZE = 500;

/** RabbitMQ rejects a prefetch above this. */
const PREFETCH = 100;

/** How often buffered deliveries are painted. Faster than the eye needs. */
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

/**
 * Live tail of a queue.
 *
 * Unlike every other screen, this one holds its broker connection open for as
 * long as it is mounted: a consumer only exists for the lifetime of its channel.
 * The `withConnection` block is parked on a promise that resolves when the
 * screen closes, which guarantees the consumer is cancelled and the channel shut
 * down on the way out.
 *
 * The buffer is capped because a busy queue would otherwise grow the render tree
 * without bound.
 */
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
  // One union rather than a status plus a parallel error string: the pair could
  // only ever be set together, and the type system could not see that.
  const [status, setStatus] = useState<ConsumerStatus>({ kind: "starting" });
  const [paused, setPaused] = useState(false);

  const counter = useRef(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  // Deliveries land here and are flushed on a timer. A busy queue delivers far
  // faster than the terminal can usefully repaint, and a setState per message
  // would re-render (and re-measure every visible payload) thousands of times a
  // second.
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
            // While paused the counter still advances, so the user can see how
            // much traffic went by without the list moving under them.
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

  useKeyHandler(
    (input) => {
      if (input === " ") setPaused((value) => !value);
      else if (input === "x") {
        // Drop what is waiting to be painted too, or it reappears on the next flush.
        buffered.current = [];
        setEntries([]);
      }
    },
    { isActive },
  );

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

  // Two lines per message, minus the status line.
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
            : "peeking (messages stay queued)"}{" "}
          {glyphs.bullet} space pause {glyphs.bullet} x clear
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
