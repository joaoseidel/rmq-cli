import { useMemo, useRef } from "react";

export interface ListState {
  readonly filter: string;
  readonly index: number;
  readonly selected: readonly string[];
}

export interface ListMemory {
  read(key: string): ListState;
  write(key: string, state: ListState): void;

  clearMarks(): void;

  clear(): void;
}

const EMPTY: ListState = { filter: "", index: 0, selected: [] };

export function useListMemory(): ListMemory {
  const store = useRef(new Map<string, ListState>());

  return useMemo(
    () => ({
      read: (key) => store.current.get(key) ?? EMPTY,
      write: (key, state) => {
        store.current.set(key, state);
      },
      clearMarks: () => {
        for (const [key, state] of store.current) {
          if (state.selected.length > 0)
            store.current.set(key, { ...state, selected: [] });
        }
      },
      clear: () => store.current.clear(),
    }),
    [],
  );
}
