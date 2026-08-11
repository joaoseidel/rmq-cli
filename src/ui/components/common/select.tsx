import { Box, Text } from "ink";
import { memo, useMemo } from "react";
import { useKeyHandler } from "../../hooks/use-key-handler.ts";
import { useListNavigation } from "../../hooks/use-list-navigation.ts";
import { glyphs, theme } from "../../theme.ts";
import {
  displayWidth,
  padToWidth,
  truncateToWidth,
} from "../../utils/width.ts";

export interface SelectItem<V> {
  readonly value: V;
  readonly label: string;
  /** Secondary text shown after the label, e.g. a count or a hint. */
  readonly detail?: string;
  readonly disabled?: boolean;
}

export interface SelectProps<V> {
  readonly items: readonly SelectItem<V>[];
  readonly onSubmit: (value: V) => void;
  readonly onCancel?: () => void;
  readonly isActive?: boolean;
  readonly visibleCount?: number;
  readonly width?: number;
  /** Shown in place of the list when `items` is empty. */
  readonly emptyLabel?: string;
  /** Disable when a text field shares the screen — see `useListNavigation`. */
  readonly letterKeys?: boolean;
}

const DEFAULT_VISIBLE = 10;

function SelectComponent<V>({
  items,
  onSubmit,
  onCancel,
  isActive = true,
  visibleCount = DEFAULT_VISIBLE,
  width = 60,
  emptyLabel = "Nothing to choose from",
  letterKeys = true,
}: SelectProps<V>) {
  const pageSize = Math.min(visibleCount, Math.max(1, items.length));

  const layout = useMemo(() => {
    const hasDetail = items.some((item) => item.detail !== undefined);
    if (!hasDetail) return { hasDetail, labelColumn: 0 };

    let widest = 0;
    for (const item of items) {
      const itemWidth = displayWidth(item.label);
      if (itemWidth > widest) widest = itemWidth;
    }

    return {
      hasDetail,
      labelColumn: Math.min(widest + 2, Math.floor(width * 0.5)),
    };
  }, [items, width]);

  const navigation = useListNavigation({
    itemCount: items.length,
    pageSize,
    isActive,
    wrap: true,
    letterKeys,
    onSelect: (index) => {
      const item = items[index];
      if (item === undefined || item.disabled === true) return;
      onSubmit(item.value);
    },
  });

  // Escape is handled here rather than in the navigation hook so it still works
  // when the list is empty and navigation has nothing to do.
  useKeyHandler(
    (_input, key) => {
      if (key.escape) onCancel?.();
    },
    { isActive: isActive && onCancel !== undefined },
  );

  if (items.length === 0) {
    return <Text color={theme.muted}>{emptyLabel}</Text>;
  }

  const [start, end] = navigation.visibleRange;

  // Details are right-aligned into a column so the list reads as a table rather
  // than a run-on sentence per row. Measuring walks every item, not just the
  // visible ones, so it is held until the items or the width actually change.
  const { hasDetail, labelColumn } = layout;

  return (
    <Box flexDirection="column">
      {navigation.hasMoreAbove ? (
        <Text color={theme.muted}> {glyphs.ellipsis}</Text>
      ) : null}

      {items.slice(start, end).map((item, offset) => {
        const index = start + offset;
        const selected = index === navigation.selectedIndex;

        return (
          <Box key={`${String(item.value)}-${index}`}>
            <Text color={selected ? theme.info : undefined}>
              {selected ? `${glyphs.cursor} ` : "  "}
            </Text>
            <Text
              color={
                item.disabled === true
                  ? theme.muted
                  : selected
                    ? theme.info
                    : undefined
              }
              bold={selected}
              dimColor={item.disabled === true}
            >
              {hasDetail
                ? padToWidth(item.label, labelColumn)
                : truncateToWidth(item.label, Math.max(4, width - 4))}
            </Text>
            {item.detail === undefined ? null : (
              <Text color={theme.muted}>
                {truncateToWidth(
                  item.detail,
                  Math.max(4, width - labelColumn - 4),
                )}
              </Text>
            )}
          </Box>
        );
      })}

      {navigation.hasMoreBelow ? (
        <Text color={theme.muted}> {glyphs.ellipsis}</Text>
      ) : null}
    </Box>
  );
}

/**
 * Re-renders only when the visible data actually changes.
 *
 * Identity comparison on `items` is not enough: callers build the array inline
 * from a filter, so a fresh array arrives on every keystroke even when the
 * contents are identical.
 */
function arePropsEqual<V>(
  previous: SelectProps<V>,
  next: SelectProps<V>,
): boolean {
  if (previous.items.length !== next.items.length) return false;
  if (previous.isActive !== next.isActive) return false;
  if (previous.visibleCount !== next.visibleCount) return false;
  if (previous.width !== next.width) return false;
  if (previous.onSubmit !== next.onSubmit) return false;
  if (previous.letterKeys !== next.letterKeys) return false;

  for (const [index, item] of previous.items.entries()) {
    const other = next.items[index];
    if (other === undefined) return false;
    if (
      item.value !== other.value ||
      item.label !== other.label ||
      item.detail !== other.detail
    )
      return false;
    if (item.disabled !== other.disabled) return false;
  }

  return true;
}

export const Select = memo(
  SelectComponent,
  arePropsEqual,
) as typeof SelectComponent;
