import { Box, Text } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import type { Message } from "../../../core/domain/message.ts";
import type { Queue } from "../../../core/domain/queue.ts";
import type { BrokerClient } from "../../../core/ports/broker.ts";
import {
  DEFAULT_SEARCH_LIMIT,
  SEARCH_DEPTHS,
  stepSearchDepth,
  type MessageOperations,
  type MessageSearchOutcome,
} from "../../../core/usecase/message-operations.ts";
import { errorMessage, formatCount } from "../../../core/util/text.ts";
import type { ActionId } from "../../actions.ts";
import { useListNavigation } from "../../hooks/use-list-navigation.ts";
import { useScreenKeys } from "../../hooks/use-screen-keys.ts";
import { glyphs, theme } from "../../theme.ts";
import { FilterBar } from "../parts/filter-bar.tsx";
import { StatusMessage } from "../parts/status-message.tsx";
import { SearchHitTable } from "../parts/tables.tsx";

/** Scope line, filter line, table header, its two rules, and the status line. */
const SEARCH_CHROME_LINES = 6;

const EMPTY_OUTCOME: MessageSearchOutcome = {
  hits: [],
  scanned: 0,
  queuesScanned: 0,
  failures: [],
  truncated: [],
  cancelled: false,
};

interface SearchRun {
  readonly term: string;
  /**
   * The depth this run used. Held on the run rather than read from the current
   * setting, so the cap warning always quotes the number that actually produced
   * the results on screen, not one the user has since changed.
   */
  readonly limit: number;
  readonly outcome: MessageSearchOutcome;
  readonly done: boolean;
  /** Set when the scan itself failed, as opposed to one queue inside it. */
  readonly error?: string;
}

export interface SearchScreenProps {
  readonly broker: BrokerClient;
  readonly messages: MessageOperations;
  readonly connection: ConnectionInfo;
  /** The queues to search, as filtered on the queue browser. */
  readonly queues: readonly Queue[];
  /** The queue filter that produced the scope, shown in the header. */
  readonly scope: string;
  readonly onOpen: (queue: Queue, message: Message) => void;
  readonly onAction: (id: ActionId) => void;
  readonly width: number;
  readonly height: number;
  readonly isActive: boolean;
}

/**
 * Message search across several queues at once.
 *
 * The queue browser's `/` narrows the list to the queues worth looking in; this
 * screen answers the question that follows — which of them actually holds the
 * message. Without it the only way through is to open each queue, filter, go
 * back, and repeat, which is exactly the loop you cannot afford when a payment
 * has gone missing and there are eleven candidate dead-letter queues.
 *
 * Results stream in queue by queue rather than appearing at the end, because the
 * answer is usually in the first queue or two and there is no reason to make the
 * user wait for the rest of the scan to confirm it.
 */
export function SearchScreen({
  broker,
  messages,
  connection,
  queues,
  scope,
  onOpen,
  onAction,
  width,
  height,
  isActive,
}: SearchScreenProps) {
  const [term, setTerm] = useState("");
  const [typing, setTyping] = useState(true);
  const [query, setQuery] = useState("");
  // Bumped by `r` to re-run the same term against a broker that has moved on.
  const [runToken, setRunToken] = useState(0);
  // Messages peeked per queue. Changing it re-runs the search, which is the
  // whole point: you raise it because the last run told you it stopped short.
  const [limit, setLimit] = useState<number>(DEFAULT_SEARCH_LIMIT);
  const [run, setRun] = useState<SearchRun | null>(null);

  const queueNames = useMemo(() => queues.map((queue) => queue.name), [queues]);
  const queuesByName = useMemo(
    () => new Map(queues.map((queue) => [queue.name, queue])),
    [queues],
  );

  // Read by the scan between queues so leaving the screen stops it at the next
  // boundary instead of running the remaining queues into a dead component.
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (query === "") {
      setRun(null);
      return;
    }

    cancelledRef.current = false;
    let live = true;
    setRun({ term: query, limit, outcome: EMPTY_OUTCOME, done: false });

    broker
      .withConnection(connection, (open) =>
        messages.searchMessages({
          queueNames,
          term: query,
          limitPerQueue: limit,
          connection: open,
          isCancelled: () => cancelledRef.current,
          onProgress: (outcome) => {
            if (live) setRun({ term: query, limit, outcome, done: false });
          },
        }),
      )
      .then((outcome) => {
        if (live) setRun({ term: query, limit, outcome, done: true });
      })
      .catch((error: unknown) => {
        if (!live) return;
        setRun({
          term: query,
          limit,
          outcome: EMPTY_OUTCOME,
          done: true,
          error: errorMessage(error),
        });
      });

    return () => {
      live = false;
      cancelledRef.current = true;
    };
  }, [query, runToken, limit, broker, messages, connection, queueNames]);

  const hits = run?.outcome.hits ?? [];
  const rowsAvailable = Math.max(1, height - SEARCH_CHROME_LINES);

  const navigation = useListNavigation({
    itemCount: hits.length,
    pageSize: rowsAvailable,
    isActive: isActive && !typing,
    onSelect: (index) => {
      const hit = hits[index];
      if (hit === undefined) return;

      const queue = queuesByName.get(hit.queue);
      if (queue !== undefined) onOpen(queue, hit.message);
    },
  });

  useScreenKeys("search", onAction, {
    isActive: isActive && !typing,
    local: {
      "/": () => setTyping(true),
      "+": () => setLimit((current) => stepSearchDepth(current, "deeper")),
      "-": () => setLimit((current) => stepSearchDepth(current, "shallower")),
      r: () => {
        if (query !== "") setRunToken((token) => token + 1);
      },
    },
  });

  const [start, end] = navigation.visibleRange;

  return (
    <Box flexDirection="column">
      <FilterBar
        label="search"
        value={term}
        onChange={setTerm}
        onSubmit={() => {
          setTyping(false);
          setQuery(term);
        }}
        onCancel={() => {
          setTerm("");
          setTyping(false);
          setQuery("");
        }}
        active={typing}
        matchCount={hits.length}
      />

      <Text color={theme.muted}>
        {formatCount(queues.length, "queue")}
        {scope === "" ? "" : ` matching '${scope}'`} {glyphs.bullet} up to{" "}
        <Text color={limit === DEFAULT_SEARCH_LIMIT ? theme.muted : theme.info}>
          {limit}
        </Text>{" "}
        messages each, never consumed
      </Text>

      <SearchBody
        run={run}
        typing={typing}
        hits={hits}
        width={width}
        start={start}
        end={end}
        selectedIndex={navigation.selectedIndex}
      />
    </Box>
  );
}

function SearchBody({
  run,
  typing,
  hits,
  width,
  start,
  end,
  selectedIndex,
}: {
  readonly run: SearchRun | null;
  readonly typing: boolean;
  readonly hits: MessageSearchOutcome["hits"];
  readonly width: number;
  readonly start: number;
  readonly end: number;
  readonly selectedIndex: number;
}) {
  if (run === null) {
    return (
      <Text color={theme.muted}>
        {typing
          ? "Type a payload or message id to look for, then Enter."
          : "Press / to search these queues."}
      </Text>
    );
  }

  if (run.error !== undefined) {
    return <StatusMessage tone="danger">{run.error}</StatusMessage>;
  }

  return (
    <>
      {hits.length === 0 ? (
        <Text color={theme.muted}>
          {run.done
            ? `No messages matching '${run.term}'.`
            : `Searching for '${run.term}'…`}
        </Text>
      ) : (
        <>
          <SearchHitTable
            hits={hits.slice(start, end)}
            width={width}
            pattern={run.term}
            selectedIndex={selectedIndex - start}
          />
          {/* The id of the highlighted hit, which the table has no room for:
              the queue and the payload earn those columns instead. */}
          <Text color={theme.muted}>
            {selectedIndex + 1}/{hits.length} {glyphs.bullet}{" "}
            {hits[selectedIndex]?.message.id ?? ""}
          </Text>
        </>
      )}

      <SearchSummary run={run} />
    </>
  );
}

/**
 * The line under the results: how much of the scope was actually looked at.
 *
 * A search that found nothing is only useful alongside what it covered, so the
 * caps and the unreadable queues are stated rather than left implicit.
 */
function SearchSummary({ run }: { readonly run: SearchRun }) {
  const { outcome, done } = run;
  const { truncated, failures } = outcome;

  const progress = done
    ? `${formatCount(outcome.queuesScanned, "queue")} searched`
    : `searching ${outcome.queuesScanned + 1}…`;

  const caveats: string[] = [];
  if (truncated.length > 0) {
    const deepest = SEARCH_DEPTHS[SEARCH_DEPTHS.length - 1] ?? run.limit;
    caveats.push(
      `${formatCount(truncated.length, "queue")} hit the ${run.limit}-message cap ` +
        `(${truncated.slice(0, 3).join(", ")}${truncated.length > 3 ? ", …" : ""}) — ` +
        (run.limit < deepest
          ? "press + to search deeper"
          : "there may be older messages this did not reach"),
    );
  }
  if (failures.length > 0) {
    caveats.push(
      `${formatCount(failures.length, "queue")} could not be read: ` +
        failures
          .slice(0, 2)
          .map((entry) => `${entry.queue} (${entry.error})`)
          .join("; "),
    );
  }
  if (outcome.cancelled) caveats.push("stopped early");

  return (
    <Box flexDirection="column">
      <Text color={theme.muted}>
        {progress} {glyphs.bullet} {formatCount(outcome.scanned, "message")}{" "}
        peeked {glyphs.bullet} {formatCount(outcome.hits.length, "message")}{" "}
        matching
      </Text>
      {caveats.map((caveat) => (
        <Text key={caveat} color={theme.warning}>
          {glyphs.warning} {caveat}
        </Text>
      ))}
    </Box>
  );
}
