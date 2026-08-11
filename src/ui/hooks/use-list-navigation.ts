import { useEffect, useMemo, useState } from "react";
import { useKeyHandler } from "./use-key-handler.ts";

export interface ListNavigation {
  /** Index of the highlighted item within the full list. */
  readonly selectedIndex: number;
  /** Index of the first visible row. */
  readonly offset: number;
  /** Half-open range of items to render: `[offset, offset + pageSize)`. */
  readonly visibleRange: readonly [number, number];
  readonly hasMoreAbove: boolean;
  readonly hasMoreBelow: boolean;
  readonly select: (index: number) => void;
}

/**
 * Cursor and viewport management for a scrolling list.
 *
 * Keeps a sliding window over the items and moves it only when the cursor would
 * leave it, so the list scrolls one line at a time instead of jumping a page.
 * Selection is clamped whenever the list shrinks — the common case being a
 * filter that removes the row the cursor was sitting on.
 *
 * Arrow keys, `j`/`k`, page keys, and Home/End are bound while `isActive`.
 */
export function useListNavigation(input: {
  itemCount: number;
  pageSize: number;
  isActive?: boolean;
  /** Wraps around at the ends instead of stopping. */
  wrap?: boolean;
  /**
   * Binds the vim-style letter keys (j/k/g/G) alongside the arrows. Turn off
   * wherever a text field shares the screen, or those letters get swallowed as
   * navigation instead of being typed.
   */
  letterKeys?: boolean;
  onSelect?: (index: number) => void;
}): ListNavigation {
  const {
    itemCount,
    pageSize,
    isActive = true,
    wrap = false,
    letterKeys = true,
    onSelect,
  } = input;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [offset, setOffset] = useState(0);

  const maxIndex = Math.max(0, itemCount - 1);
  const window = Math.max(1, pageSize);

  // Keep the cursor and viewport inside the list as it changes size.
  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, maxIndex));
    setOffset((current) =>
      Math.max(0, Math.min(current, Math.max(0, itemCount - window))),
    );
  }, [itemCount, maxIndex, window]);

  const move = (delta: number) => {
    setSelectedIndex((current) => {
      let next = current + delta;

      if (wrap && itemCount > 0) {
        next = ((next % itemCount) + itemCount) % itemCount;
      } else {
        next = Math.max(0, Math.min(next, maxIndex));
      }

      setOffset((currentOffset) => {
        if (next < currentOffset) return next;
        if (next >= currentOffset + window) return next - window + 1;
        return currentOffset;
      });

      return next;
    });
  };

  const select = (index: number) => {
    const clamped = Math.max(0, Math.min(index, maxIndex));
    setSelectedIndex(clamped);
    setOffset((current) => {
      if (clamped < current) return clamped;
      if (clamped >= current + window) return clamped - window + 1;
      return current;
    });
  };

  useKeyHandler(
    (character, key) => {
      if (itemCount === 0) return;

      if (key.downArrow || (letterKeys && character === "j")) move(1);
      else if (key.upArrow || (letterKeys && character === "k")) move(-1);
      else if (key.pageDown || (key.ctrl && character === "f")) move(window);
      else if (key.pageUp || (key.ctrl && character === "b")) move(-window);
      else if (key.home || (letterKeys && character === "g")) select(0);
      else if (key.end || (letterKeys && character === "G")) select(maxIndex);
      else if (key.return) onSelect?.(selectedIndex);
    },
    { isActive },
  );

  const visibleRange = useMemo(
    () => [offset, Math.min(offset + window, itemCount)] as const,
    [offset, window, itemCount],
  );

  return {
    selectedIndex,
    offset,
    visibleRange,
    hasMoreAbove: offset > 0,
    hasMoreBelow: offset + window < itemCount,
    select,
  };
}
