/**
 * Semantic colour palette.
 *
 * Components reference roles rather than colours so the whole CLI can be
 * retinted in one place. Values are Ink colour names, which degrade gracefully
 * on limited terminals and disappear entirely under `NO_COLOR`.
 */
export const theme = {
  /** Successful outcomes. */
  success: "green",
  /** Failures the user must act on. */
  danger: "red",
  /** Caveats and destructive-action prompts. */
  warning: "yellow",
  /** Emphasis: names, counts, matched text. */
  info: "cyan",
  /** Secondary detail: hints, units, inactive rows. */
  muted: "gray",
  /** Table rules and separators. */
  border: "gray",
  /** Selected row background. */
  selectionBackground: "blueBright",
  selectionForeground: "black",
} as const;

export type ThemeRole = keyof typeof theme;

/** Glyphs used across screens. Kept single-width to keep tables aligned. */
export const glyphs = {
  cursor: "❯", // ❯
  bullet: "•", // •
  check: "✓", // ✓
  cross: "✗", // ✗
  warning: "!",
  ellipsis: "…", // …
  arrowRight: "→", // →
} as const;

/** Light box-drawing set used by the table renderer. */
export const borders = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  teeDown: "┬",
  teeUp: "┴",
  teeRight: "├",
  teeLeft: "┤",
  cross: "┼",
} as const;
