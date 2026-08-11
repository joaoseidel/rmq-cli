import { useEffect, useMemo, useState } from "react";
import { globMatcher } from "../../core/util/glob.ts";
import type { ListMemory } from "./use-list-memory.ts";
import { useListNavigation } from "./use-list-navigation.ts";

const LIST_CHROME_LINES = 5;

export interface FilterableListOptions<T> {
  readonly items: readonly T[];
  readonly searchable: (item: T) => readonly string[];
  readonly height: number;
  readonly isActive: boolean;
  readonly onOpen: (item: T) => void;
  readonly onSelectionChange: (item: T | null) => void;
  readonly openFilter: boolean;
  readonly onFilterOpened: () => void;
  readonly clearSelectionOnUnmount?: boolean;
  readonly memory: ListMemory;
  readonly memoryKey: string;
  readonly key: (item: T) => string;
  readonly onMarkedChange: (items: readonly T[]) => void;
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
  readonly marked: readonly T[];
  readonly isMarked: (item: T) => boolean;
  readonly toggleMark: () => void;
  readonly toggleMarkAll: () => void;
  readonly clearMarks: () => void;
}

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
    memory,
    memoryKey,
    key,
    onMarkedChange,
  } = options;

  const [remembered] = useState(() => memory.read(memoryKey));

  const [filter, setFilter] = useState(remembered.filter);
  const [filtering, setFiltering] = useState(false);
  const [markedKeys, setMarkedKeys] = useState<ReadonlySet<string>>(
    () => new Set(remembered.selected),
  );

  useEffect(() => {
    if (!openFilter) return;
    setFiltering(true);
    onFilterOpened();
  }, [openFilter, onFilterOpened]);

  const visible = useMemo(() => {
    if (filter === "") return items;

    const matches = globMatcher(`*${filter}*`);
    return items.filter((item) => searchable(item).some(matches));
  }, [items, filter, searchable]);

  const rowsAvailable = Math.max(1, height - LIST_CHROME_LINES);

  const navigation = useListNavigation({
    itemCount: visible.length,
    pageSize: rowsAvailable,
    isActive: isActive && !filtering,
    initialIndex: remembered.index,
    onSelect: (index) => {
      const item = visible[index];
      if (item !== undefined) onOpen(item);
    },
  });

  const selected = visible[navigation.selectedIndex] ?? null;

  useEffect(() => {
    memory.write(memoryKey, {
      filter,
      index: navigation.selectedIndex,
      selected: [...markedKeys],
    });
  }, [memory, memoryKey, filter, navigation.selectedIndex, markedKeys]);

  const marked = useMemo(
    () => items.filter((item) => markedKeys.has(key(item))),
    [items, markedKeys, key],
  );

  useEffect(() => {
    onMarkedChange(marked);
  }, [marked, onMarkedChange]);

  useEffect(
    () => () => {
      memory.write(memoryKey, { ...memory.read(memoryKey), selected: [] });
      onMarkedChange([]);
    },
    [memory, memoryKey, onMarkedChange],
  );

  useEffect(() => {
    onSelectionChange(selected);
  }, [selected, onSelectionChange]);

  const clearOnUnmount = options.clearSelectionOnUnmount === true;
  useEffect(() => {
    if (!clearOnUnmount) return;
    return () => onSelectionChange(null);
  }, [clearOnUnmount, onSelectionChange]);

  const toggleMark = () => {
    if (selected === null) return;
    const target = key(selected);

    setMarkedKeys((current) => {
      const next = new Set(current);
      if (!next.delete(target)) next.add(target);
      return next;
    });

    navigation.select(navigation.selectedIndex + 1);
  };

  const toggleMarkAll = () => {
    const visibleKeys = visible.map(key);
    const allMarked =
      visibleKeys.length > 0 &&
      visibleKeys.every((entry) => markedKeys.has(entry));

    setMarkedKeys((current) => {
      const next = new Set(current);
      for (const entry of visibleKeys) {
        if (allMarked) next.delete(entry);
        else next.add(entry);
      }
      return next;
    });
  };

  return {
    filter,
    filtering,
    startFiltering: () => setFiltering(true),
    marked,
    isMarked: (item: T) => markedKeys.has(key(item)),
    toggleMark,
    toggleMarkAll,
    clearMarks: () => setMarkedKeys(new Set()),
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
