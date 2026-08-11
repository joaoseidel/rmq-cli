import { useEffect, useMemo, useState } from "react";
import { globMatcher } from "../../core/util/glob.ts";
import { useListNavigation } from "./use-list-navigation.ts";

/** Filter line, table header, its two rules, and the footer count. */
const LIST_CHROME_LINES = 5;

export interface FilterableListOptions<T> {
  readonly items: readonly T[];
  /** Fields of an item the filter should be tested against. */
  readonly searchable: (item: T) => readonly string[];
  readonly height: number;
  readonly isActive: boolean;
  readonly onOpen: (item: T) => void;
  readonly onSelectionChange: (item: T | null) => void;
  /** Set by the palette's Filter action; cleared once the field is open. */
  readonly openFilter: boolean;
  readonly onFilterOpened: () => void;
  /**
   * Publish `null` on unmount. List screens that hand their selection to the
   * app set this so the palette cannot offer actions against a row from a screen
   * the user has already left.
   */
  readonly clearSelectionOnUnmount?: boolean;
}

export interface FilterBarProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly active: boolean;
  readonly matchCount: number;
}

export interface FilterableList<T> {
  readonly filter: string;
  readonly filtering: boolean;
  readonly startFiltering: () => void;
  readonly visible: readonly T[];
  readonly selected: T | null;
  readonly selectedIndex: number;
  readonly visibleRange: readonly [number, number];
  readonly filterBarProps: FilterBarProps;
}

/**
 * The shared behaviour of every filterable list screen.
 *
 * The queue browser and the message browser had this written out twice, line for
 * line, and had already begun to drift — one cleared its published selection on
 * unmount and the other did not. Keeping it here makes them behave identically
 * by construction; the screens supply only what is genuinely different (the
 * items, which fields to search, the table, and the empty-state text).
 */
export function useFilterableList<T>(
  options: FilterableListOptions<T>,
): FilterableList<T> {
  const {
    items,
    searchable,
    height,
    isActive,
    onOpen,
    onSelectionChange,
    openFilter,
    onFilterOpened,
  } = options;

  const [filter, setFilter] = useState("");
  const [filtering, setFiltering] = useState(false);

  useEffect(() => {
    if (!openFilter) return;
    setFiltering(true);
    onFilterOpened();
  }, [openFilter, onFilterOpened]);

  const visible = useMemo(() => {
    if (filter === "") return items;
    // Compiled once for the whole pass rather than once per row.
    const matches = globMatcher(`*${filter}*`);
    return items.filter((item) => searchable(item).some(matches));
  }, [items, filter, searchable]);

  const rowsAvailable = Math.max(1, height - LIST_CHROME_LINES);

  const navigation = useListNavigation({
    itemCount: visible.length,
    pageSize: rowsAvailable,
    isActive: isActive && !filtering,
    onSelect: (index) => {
      const item = visible[index];
      if (item !== undefined) onOpen(item);
    },
  });

  const selected = visible[navigation.selectedIndex] ?? null;

  useEffect(() => {
    onSelectionChange(selected);
  }, [selected, onSelectionChange]);

  const clearOnUnmount = options.clearSelectionOnUnmount === true;
  useEffect(() => {
    if (!clearOnUnmount) return;
    return () => onSelectionChange(null);
  }, [clearOnUnmount, onSelectionChange]);

  return {
    filter,
    filtering,
    startFiltering: () => setFiltering(true),
    visible,
    selected,
    selectedIndex: navigation.selectedIndex,
    visibleRange: navigation.visibleRange,
    filterBarProps: {
      value: filter,
      onChange: setFilter,
      onSubmit: () => setFiltering(false),
      onCancel: () => {
        setFilter("");
        setFiltering(false);
      },
      active: filtering,
      matchCount: visible.length,
    },
  };
}
