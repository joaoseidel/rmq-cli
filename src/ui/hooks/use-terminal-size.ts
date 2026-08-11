import { useWindowSize } from "ink";

const MIN_COLUMNS = 40;
const MIN_ROWS = 8;

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
  readonly interactive: boolean;
}

export function useTerminalSize(): TerminalSize {
  const { columns, rows } = useWindowSize();

  return {
    columns: Math.max(columns, MIN_COLUMNS),
    rows: Math.max(rows, MIN_ROWS),
    interactive: process.stdout.isTTY === true,
  };
}
