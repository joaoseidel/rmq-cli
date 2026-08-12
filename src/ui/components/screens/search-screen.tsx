import { Box, Text } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import type { Message } from "../../../core/domain/message.ts";
import { totalMessages, type Queue } from "../../../core/domain/queue.ts";
import type { Preferences } from "../../../core/domain/preferences.ts";
import {
  DEFAULT_SEARCH_LIMIT,
  SEARCH_DEPTHS,
  stepSearchDepth,
  type MessageOperations,
  type MessageSearchOutcome,
} from "../../../core/usecase/message-operations.ts";
import {
  parseQuery,
  queryHighlight,
} from "../../../core/usecase/message-query.ts";
import { errorMessage, formatCount } from "../../../core/util/text.ts";
import type { ActionId } from "../../actions.ts";
import { useListNavigation } from "../../hooks/use-list-navigation.ts";
import { useScreenKeys } from "../../hooks/use-screen-keys.ts";
import { glyphs, theme } from "../../theme.ts";
import { FilterBar } from "../parts/filter-bar.tsx";
import { StatusMessage } from "../parts/status-message.tsx";
import { SearchHitTable } from "../parts/tables.tsx";

const SEARCH_CHROME_LINES = 6;

const EMPTY_OUTCOME: MessageSearchOutcome = {
  hits: [],
  scanned: 0,
  queuesScanned: 0,
  failures: [],
  truncated: [],
  partial: [],
  cancelled: false,
};

interface SearchRun {
  readonly term: string;
  readonly limit: number;
  readonly outcome: MessageSearchOutcome;
  readonly done: boolean;
  readonly error?: string;
}

export interface SearchScreenProps {
  readonly messages: MessageOperations;
  readonly preferences: Preferences;
  readonly savePreferences: (changes: Partial<Preferences>) => Preferences;
  readonly connection: ConnectionInfo;
  readonly queues: readonly Queue[];
  readonly scope: string;
  readonly onOpen: (queue: Queue, message: Message) => void;
  readonly onAction: (id: ActionId) => void;
  readonly width: number;
  readonly height: number;
  readonly isActive: boolean;
}

export function SearchScreen({
  messages,
  preferences,
  savePreferences,
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

  const [runToken, setRunToken] = useState(0);

  const [limit, setLimit] = useState<number>(preferences.searchDepth);
  const [run, setRun] = useState<SearchRun | null>(null);

  const targets = useMemo(
    () =>
      queues.map((queue) => ({
        name: queue.name,
        total: totalMessages(queue),
      })),
    [queues],
  );
  const queuesByName = useMemo(
    () => new Map(queues.map((queue) => [queue.name, queue])),
    [queues],
  );

  const parsed = useMemo(
    () => (query === "" ? null : parseQuery(query)),
    [query],
  );
  const invalid = parsed?.kind === "invalid" ? parsed.reason : null;

  const cancelledRef = useRef(false);

  useEffect(() => {
    if (query === "" || invalid !== null) {
      setRun(null);
      return;
    }

    cancelledRef.current = false;
    let live = true;
    setRun({ term: query, limit, outcome: EMPTY_OUTCOME, done: false });

    messages
      .searchMessages({
        queues: targets,
        term: query,
        limitPerQueue: limit,
        concurrency: preferences.searchConcurrency,
        info: connection,
        isCancelled: () => cancelledRef.current,
        onProgress: (outcome) => {
          if (live) setRun({ term: query, limit, outcome, done: false });
        },
      })
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
  }, [query, runToken, limit, invalid, messages, connection, targets]);

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

  const remember = (current: number, direction: "deeper" | "shallower") => {
    const next = stepSearchDepth(current, direction);
    if (next !== current) savePreferences({ searchDepth: next });
    return next;
  };

  useScreenKeys("search", onAction, {
    isActive: isActive && !typing,
    local: {
      "/": () => setTyping(true),
      "+": () => setLimit((current) => remember(current, "deeper")),
      "-": () => setLimit((current) => remember(current, "shallower")),
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

      {invalid === null ? (
        <SearchBody
          run={run}
          typing={typing}
          hits={hits}
          width={width}
          start={start}
          end={end}
          highlight={
            parsed === null || parsed.kind === "invalid"
              ? ""
              : queryHighlight(parsed)
          }
          selectedIndex={navigation.selectedIndex}
        />
      ) : (
        <StatusMessage tone="danger">{invalid}</StatusMessage>
      )}
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
  highlight,
  selectedIndex,
}: {
  readonly run: SearchRun | null;
  readonly typing: boolean;
  readonly hits: MessageSearchOutcome["hits"];
  readonly width: number;
  readonly start: number;
  readonly end: number;
  readonly highlight: string;
  readonly selectedIndex: number;
}) {
  if (run === null) {
    return (
      <Box flexDirection="column">
        <Text color={theme.muted}>
          {typing
            ? "Type text, a JSON fragment, or field:value to look for, then Enter."
            : "Press / to search these queues."}
        </Text>
        <Text color={theme.muted}>
          {glyphs.bullet} {'{"status":"failed"}'} matches that fragment wherever
          it is nested
        </Text>
        <Text color={theme.muted}>
          {glyphs.bullet} order.items.sku:AB-991 walks into the payload
        </Text>
        <Text color={theme.muted}>
          {glyphs.bullet} re:AB-\d{"{3}"} runs an explicit regular expression
        </Text>
      </Box>
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
            allHits={hits}
            width={width}
            pattern={highlight}
            selectedIndex={selectedIndex - start}
          />

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

function SearchSummary({ run }: { readonly run: SearchRun }) {
  const { outcome, done } = run;
  const { truncated, failures, partial } = outcome;

  const progress = done
    ? `${formatCount(outcome.queuesScanned, "queue")} searched`
    : `searching ${outcome.queuesScanned + 1}…`;

  const caveats: string[] = [];
  if (truncated.length > 0) {
    const deepest = SEARCH_DEPTHS[SEARCH_DEPTHS.length - 1] ?? run.limit;
    caveats.push(
      `${formatCount(truncated.length, "queue")} hit the ${run.limit}-message cap ` +
        `(${truncated.slice(0, 3).join(", ")}${truncated.length > 3 ? ", …" : ""}). ` +
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
  if (partial.length > 0) {
    caveats.push(
      `${formatCount(partial.length, "queue")} stopped early, so these results are incomplete ` +
        `(${partial.slice(0, 3).join(", ")}${partial.length > 3 ? ", …" : ""})`,
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
