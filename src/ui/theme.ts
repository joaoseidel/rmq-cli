export const theme = {
  success: "green",

  danger: "red",

  warning: "yellow",

  info: "cyan",

  muted: "gray",

  border: "gray",

  selectionBackground: "blueBright",
  selectionForeground: "black",
} as const;

export type ThemeRole = keyof typeof theme;

export const glyphs = {
  cursor: "❯",
  bullet: "•",
  check: "✓",
  cross: "✗",
  warning: "!",
  ellipsis: "…",
  arrowRight: "→",
} as const;

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
