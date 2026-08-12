import stringWidth from "string-width";
import { glyphs } from "../theme.ts";

const WIDTH_OVERRIDES: Record<string, number> = {
  "⚡": 1,
  "✨": 1,
  "✅": 1,
  "⚠️": 1,
  "\u{1f7e2}": 1,
  "\u{1f7e0}": 1,
  "\u{1f534}": 1,
};

export function glyphWidth(glyph: string): number {
  const measured = stringWidth(glyph);
  const override = WIDTH_OVERRIDES[glyph];
  return override === undefined ? measured : Math.max(measured, override);
}

export function displayWidth(value: string): number {
  return stringWidth(value, { countAnsiEscapeCodes: false });
}

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

export function padToWidth(
  value: string,
  width: number,
  align: "left" | "right" = "left",
): string {
  const clipped = truncateToWidth(value, width);
  const padding = " ".repeat(Math.max(0, width - displayWidth(clipped)));
  return align === "right" ? padding + clipped : clipped + padding;
}

export function wrapToWidth(value: string, width: number): string[] {
  const max = Math.max(1, width);
  if (displayWidth(value) <= max) return [value];

  const rows: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const character of value) {
    const characterWidth = glyphWidth(character);

    if (current !== "" && currentWidth + characterWidth > max) {
      rows.push(current);
      current = "";
      currentWidth = 0;
    }

    current += character;
    currentWidth += characterWidth;
  }

  if (current !== "") rows.push(current);
  return rows;
}

export function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
