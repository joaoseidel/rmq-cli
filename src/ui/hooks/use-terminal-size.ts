import { useWindowSize } from "ink";

/** Never lay out below this, or borders and headers start overlapping. */
const MIN_COLUMNS = 40;
const MIN_ROWS = 8;

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
  /** False when stdout is redirected — interactive chrome should be skipped. */
  readonly interactive: boolean;
}

/**
 * Terminal dimensions for layout.
 *
 * The width comes from Ink rather than from `process.stdout` directly, and is
 * deliberately not substituted for something roomier when output is piped: Ink
 * hard-wraps every frame at the width it detects, so laying out any wider
 * produces tables that wrap mid-row. Whatever Ink believes is the truth we have
 * to draw to.
 */
export function useTerminalSize(): TerminalSize {
  const { columns, rows } = useWindowSize();

  return {
    columns: Math.max(columns, MIN_COLUMNS),
    rows: Math.max(rows, MIN_ROWS),
    interactive: process.stdout.isTTY === true,
  };
}
