import { useEffect, useMemo, useState } from "react";
import { useKeyHandler } from "./use-key-handler.ts";

export interface ListNavigation {
  readonly selectedIndex: number;
  readonly offset: number;
  readonly visibleRange: readonly [number, number];
  readonly hasMoreAbove: boolean;
  readonly hasMoreBelow: boolean;
  readonly select: (index: number) => void;
}

export function useListNavigation(input: {
  itemCount: number;
  pageSize: number;
  isActive?: boolean;

  wrap?: boolean;

  letterKeys?: boolean;

  initialIndex?: number;
  onSelect?: (index: number) => void;
}): ListNavigation {
  const {
    itemCount,
    pageSize,
    isActive = true,
    wrap = false,
    letterKeys = true,
    initialIndex = 0,
    onSelect,
  } = input;

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  const [offset, setOffset] = useState(() =>
    Math.max(0, initialIndex - Math.max(1, input.pageSize) + 1),
  );

  const maxIndex = Math.max(0, itemCount - 1);
  const window = Math.max(1, pageSize);

  useEffect(() => {
    if (itemCount === 0) return;

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
