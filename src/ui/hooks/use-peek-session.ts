import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionInfo } from "../../core/domain/connection.ts";
import type { Message } from "../../core/domain/message.ts";
import type {
  MessageOperations,
  PeekSession,
} from "../../core/usecase/message-operations.ts";
import { toError } from "../../core/util/text.ts";

export interface PeekState {
  readonly messages: readonly Message[];
  readonly loading: boolean;
  readonly error: Error | null;
  readonly exhausted: boolean;
  readonly pagesLoaded: number;
}

export interface Peek extends PeekState {
  loadMore(): void;
}

export function usePeekSession(input: {
  operations: MessageOperations;
  connection: ConnectionInfo;
  queueName: string;
  pageSize: number;
  reloadToken: number;
}): Peek {
  const { operations, connection, queueName, pageSize, reloadToken } = input;

  const [state, setState] = useState<PeekState>({
    messages: [],
    loading: true,
    error: null,
    exhausted: false,
    pagesLoaded: 0,
  });

  const sessionRef = useRef<PeekSession | null>(null);
  const liveRef = useRef(true);
  const busyRef = useRef(false);

  const pull = useCallback(async () => {
    const session = sessionRef.current;
    if (session === null || busyRef.current) return;

    busyRef.current = true;
    setState((current) => ({ ...current, loading: true }));

    try {
      const page = await session.next(pageSize);
      if (!liveRef.current) return;

      setState((current) => ({
        messages: [...current.messages, ...page.messages],
        loading: false,
        error: null,
        exhausted: page.exhausted,
        pagesLoaded: current.pagesLoaded + 1,
      }));
    } catch (error) {
      if (!liveRef.current) return;
      setState((current) => ({
        ...current,
        loading: false,
        error: toError(error),
      }));
    } finally {
      busyRef.current = false;
    }
  }, [pageSize]);

  useEffect(() => {
    liveRef.current = true;
    busyRef.current = false;
    sessionRef.current = null;

    setState({
      messages: [],
      loading: true,
      error: null,
      exhausted: false,
      pagesLoaded: 0,
    });

    let opened: PeekSession | null = null;

    void operations
      .openPeekSession({ queueName, info: connection })
      .then((session) => {
        opened = session;
        if (!liveRef.current) return session.close();

        sessionRef.current = session;
        return pull();
      })
      .catch((error: unknown) => {
        if (!liveRef.current) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: toError(error),
        }));
      });

    return () => {
      liveRef.current = false;
      sessionRef.current = null;
      void opened?.close();
    };
  }, [operations, connection, queueName, reloadToken, pull]);

  const loadMore = useCallback(() => {
    if (state.exhausted || state.loading) return;
    void pull();
  }, [pull, state.exhausted, state.loading]);

  return { ...state, loadMore };
}
