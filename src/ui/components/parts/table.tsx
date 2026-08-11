import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { borders, glyphs, theme } from "../../theme.ts";
import {
  displayWidth,
  padToWidth,
  toSingleLine,
  truncateToWidth,
} from "../../utils/width.ts";

export interface Column<T> {
  readonly key: string;
  readonly header: string;
  readonly value: (row: T) => string;
  readonly render?: (row: T, width: number) => ReactNode;
  readonly align?: "left" | "right";
  readonly minWidth?: number;
  readonly flex?: number;
}

export interface TableProps<T> {
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly maxWidth: number;
  readonly selectedIndex?: number;
  readonly rowKey?: (row: T, index: number) => string;
  readonly isMarked?: (row: T) => boolean;
}

const CELL_PADDING = 1;

function markColumn<T>(isMarked: (row: T) => boolean): Column<T> {
  return {
    key: "__mark",
    header: " ",
    value: (row) => (isMarked(row) ? glyphs.check : " "),
    flex: 0,
    render: (row, width) =>
      isMarked(row) ? (
        <Text color={theme.success}>{fitCell(glyphs.check, width)}</Text>
      ) : (
        <Text>{fitCell(" ", width)}</Text>
      ),
  };
}

export function computeColumnWidths<T>(
  columns: readonly Column<T>[],
  rows: readonly T[],
  maxWidth: number,
): number[] {
  return widthsForCells(columns, renderCells(columns, rows), maxWidth);
}

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
    let widest = Math.max(displayWidth(column.header), 1);
    for (const row of cells) {
      const width = displayWidth(row[index] ?? "");
      if (width > widest) widest = width;
    }
    return widest;
  });

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

export function Table<T>({
  columns,
  rows,
  maxWidth,
  selectedIndex,
  rowKey,
  isMarked,
}: TableProps<T>) {
  const columns_ =
    isMarked === undefined
      ? columns
      : [markColumn(isMarked), ...(columns as Column<T>[])];

  const cells = renderCells(columns_, rows);
  const widths = widthsForCells(columns_, cells, maxWidth);
  const pad = " ".repeat(CELL_PADDING);
  const border = <Text color={theme.border}>{borders.vertical}</Text>;

  return (
    <Box flexDirection="column">
      <Rule widths={widths} kind="top" />

      <Text>
        {border}
        {columns_.map((column, index) => (
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
            {columns_.map((column, index) => {
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
                    {}
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

export function fitCell(
  value: string,
  width: number,
  align: "left" | "right" = "left",
): string {
  return padToWidth(toSingleLine(value), width, align);
}

export { truncateToWidth };
