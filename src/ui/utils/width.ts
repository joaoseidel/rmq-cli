import stringWidth from "string-width";
import { glyphs } from "../theme.ts";

/**
 * Width overrides for glyphs that `string-width` measures differently from how
 * common terminals actually render them.
 *
 * Emoji are the usual offenders: a terminal that draws one of these in a single
 * cell while we reserve two leaves every following column misaligned. Overrides
 * are floors, never ceilings — we take the larger of the two so a terminal that
 * *does* render wide is still accounted for.
 */
const WIDTH_OVERRIDES: Record<string, number> = {
  "⚡": 1, // ⚡
  "✨": 1, // ✨
  "✅": 1, // ✅
  "⚠️": 1, // ⚠️
  "\u{1f7e2}": 1, // 🟢
  "\u{1f7e0}": 1, // 🟠
  "\u{1f534}": 1, // 🔴
};

/** Rendered width of a single glyph, honouring the override table. */
export function glyphWidth(glyph: string): number {
  const measured = stringWidth(glyph);
  const override = WIDTH_OVERRIDES[glyph];
  return override === undefined ? measured : Math.max(measured, override);
}

/** Rendered width of a string in terminal cells. Control characters count as 0. */
export function displayWidth(value: string): number {
  return stringWidth(value, { countAnsiEscapeCodes: false });
}

/**
 * Clips a string to `max` cells, appending an ellipsis when anything is dropped.
 *
 * Iterates by code point so surrogate pairs are never split — a half-emoji
 * corrupts the terminal's own width tracking, not just ours.
 */
export function truncateToWidth(value: string, max: number): string {
  if (max <= 0) return "";
  if (displayWidth(value) <= max) return value;
  if (max === 1) return glyphs.ellipsis;

  const budget = max - 1;
  let width = 0;
  let result = "";

  for (const character of value) {
    const characterWidth = glyphWidth(character);
    if (width + characterWidth > budget) break;
    result += character;
    width += characterWidth;
  }

  return result + glyphs.ellipsis;
}

/** Pads a string to exactly `width` cells, clipping it first if necessary. */
export function padToWidth(
  value: string,
  width: number,
  align: "left" | "right" = "left",
): string {
  const clipped = truncateToWidth(value, width);
  const padding = " ".repeat(Math.max(0, width - displayWidth(clipped)));
  return align === "right" ? padding + clipped : clipped + padding;
}

/** Collapses newlines and tabs so a value can occupy a single table cell. */
export function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
