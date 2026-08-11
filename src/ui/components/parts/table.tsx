import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { borders, theme } from "../../theme.ts";
import {
  displayWidth,
  padToWidth,
  toSingleLine,
  truncateToWidth,
} from "../../utils/width.ts";

export interface Column<T> {
  readonly key: string;
  readonly header: string;
  /** Plain text for the cell. Also what column widths are measured from. */
  readonly value: (row: T) => string;
  /** Optional rich cell. Must render exactly the same width as `value`. */
  readonly render?: (row: T, width: number) => ReactNode;
  readonly align?: "left" | "right";
  readonly minWidth?: number;
  /** Share of the leftover width this column absorbs. 0 keeps it natural. */
  readonly flex?: number;
}

export interface TableProps<T> {
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  /** Total cells available, normally the terminal width. */
  readonly maxWidth: number;
  /** Marks one row as selected — used by the interactive screens. */
  readonly selectedIndex?: number;
  readonly rowKey?: (row: T, index: number) => string;
}

const CELL_PADDING = 1;

/**
 * Computes final column widths for the available space.
 *
 * Columns start at their natural width (the widest of header and cells). If the
 * table overflows, only flexible columns shrink, in proportion to their `flex`
 * weight and never below `minWidth` — so a payload column gives up room while
 * the counters beside it stay readable. Leftover space is handed to flexible
 * columns so the table fills the terminal rather than hugging the left edge.
 */
export function computeColumnWidths<T>(
  columns: readonly Column<T>[],
  rows: readonly T[],
  maxWidth: number,
): number[] {
  return widthsForCells(columns, renderCells(columns, rows), maxWidth);
}

/**
 * The plain text of every cell, flattened to one line.
 *
 * Built once and used for both measuring and drawing: computing it separately in
 * each pass meant every `value` callback — including the payload truncation,
 * which compiles a regex — ran twice per row per render.
 */
function renderCells<T>(
  columns: readonly Column<T>[],
  rows: readonly T[],
): string[][] {
  return rows.map((row) =>
    columns.map((column) => toSingleLine(column.value(row))),
  );
}

function widthsForCells<T>(
  columns: readonly Column<T>[],
  cells: readonly (readonly string[])[],
  maxWidth: number,
): number[] {
  const natural = columns.map((column, index) => {
    // Reduced rather than spread into Math.max: a long list would overflow the
    // argument limit.
    let widest = Math.max(displayWidth(column.header), 1);
    for (const row of cells) {
      const width = displayWidth(row[index] ?? "");
      if (width > widest) widest = width;
    }
    return widest;
  });

  // Borders: one vertical per column plus a trailing one, each cell padded.
  const chrome = columns.length * (1 + CELL_PADDING * 2) + 1;
  const available = Math.max(columns.length, maxWidth - chrome);

  const widths = [...natural];
  const total = () => widths.reduce((sum, width) => sum + width, 0);

  const flexIndexes = columns
    .map((column, index) => ({ index, flex: column.flex ?? 0 }))
    .filter((entry) => entry.flex > 0);

  const flexTotal = flexIndexes.reduce((sum, entry) => sum + entry.flex, 0);

  if (total() > available) {
    let excess = total() - available;

    for (const { index, flex } of flexIndexes) {
      if (excess <= 0) break;
      const floor = columns[index]?.minWidth ?? 4;
      const share = Math.ceil(excess * (flex / flexTotal));
      const current = widths[index] ?? floor;
      const reduced = Math.max(floor, current - share);
      excess -= current - reduced;
      widths[index] = reduced;
    }

    // Still over budget: shave the widest column, flexible or not, until the row
    // fits. A table that overflows wraps, and a wrapped table is unreadable.
    let guard = 0;
    while (total() > available && guard < 10_000) {
      guard += 1;
      let widest = 0;
      for (let index = 1; index < widths.length; index += 1) {
        if ((widths[index] ?? 0) > (widths[widest] ?? 0)) widest = index;
      }
      if ((widths[widest] ?? 0) <= 1) break;
      widths[widest] = (widths[widest] ?? 1) - 1;
    }
  } else if (flexTotal > 0) {
    let slack = available - total();
    for (const { index, flex } of flexIndexes) {
      const share = Math.floor(slack * (flex / flexTotal));
      widths[index] = (widths[index] ?? 0) + share;
    }
    slack = available - total();
    const first = flexIndexes[0];
    if (first !== undefined && slack > 0)
      widths[first.index] = (widths[first.index] ?? 0) + slack;
  }

  return widths;
}

function Rule({
  widths,
  kind,
}: {
  readonly widths: readonly number[];
  readonly kind: "top" | "middle" | "bottom";
}) {
  const [left, join, right] =
    kind === "top"
      ? [borders.topLeft, borders.teeDown, borders.topRight]
      : kind === "middle"
        ? [borders.teeRight, borders.cross, borders.teeLeft]
        : [borders.bottomLeft, borders.teeUp, borders.bottomRight];

  const segments = widths.map((width) =>
    borders.horizontal.repeat(width + CELL_PADDING * 2),
  );

  return <Text color={theme.border}>{left + segments.join(join) + right}</Text>;
}

/**
 * Fixed-width table.
 *
 * Each row is a single inline `<Text>` run rather than a row of `<Box>` cells.
 * That is load-bearing: Ink lays Boxes out with flexbox, which sizes and wraps
 * each cell independently and destroys the column alignment the padding was
 * computed for. Inline `<Text>` spans are concatenated verbatim, so what is
 * measured is what is printed.
 *
 * Deliberately not memoised: every caller builds its column array and its row
 * window fresh each render, so a shallow compare could never hit.
 */
export function Table<T>({
  columns,
  rows,
  maxWidth,
  selectedIndex,
  rowKey,
}: TableProps<T>) {
  const cells = renderCells(columns, rows);
  const widths = widthsForCells(columns, cells, maxWidth);
  const pad = " ".repeat(CELL_PADDING);
  const border = <Text color={theme.border}>{borders.vertical}</Text>;

  return (
    <Box flexDirection="column">
      <Rule widths={widths} kind="top" />

      <Text>
        {border}
        {columns.map((column, index) => (
          <Text key={column.key}>
            <Text bold>
              {pad}
              {padToWidth(column.header, widths[index] ?? 0, column.align)}
              {pad}
            </Text>
            {border}
          </Text>
        ))}
      </Text>

      <Rule widths={widths} kind="middle" />

      {rows.map((row, rowIndex) => {
        const selected = selectedIndex === rowIndex;

        return (
          <Text key={rowKey?.(row, rowIndex) ?? String(rowIndex)}>
            {border}
            {columns.map((column, index) => {
              const width = widths[index] ?? 0;
              const plain = padToWidth(
                cells[rowIndex]?.[index] ?? "",
                width,
                column.align,
              );

              return (
                <Text key={column.key}>
                  <Text
                    backgroundColor={
                      selected ? theme.selectionBackground : undefined
                    }
                    color={selected ? theme.selectionForeground : undefined}
                  >
                    {pad}
                    {/* A selected row is painted in one colour, so the rich cell
                        is skipped: highlight colours would be invisible on it. */}
                    {selected ? plain : (column.render?.(row, width) ?? plain)}
                    {pad}
                  </Text>
                  {border}
                </Text>
              );
            })}
          </Text>
        );
      })}

      <Rule widths={widths} kind="bottom" />
    </Box>
  );
}

/**
 * Fits a value to a column, for use inside a `render` callback.
 *
 * Custom cells must occupy exactly the width the layout assigned them, or every
 * border to their right shifts.
 */
export function fitCell(
  value: string,
  width: number,
  align: "left" | "right" = "left",
): string {
  return padToWidth(toSingleLine(value), width, align);
}

export { truncateToWidth };
