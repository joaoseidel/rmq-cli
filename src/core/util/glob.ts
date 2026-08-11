export function toGlobRegex(pattern: string): RegExp {
  const source = pattern
    .replaceAll(".", "\\.")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(source, "i");
}

export function removeGlob(pattern: string): string {
  return pattern.replaceAll(".", "").replaceAll("*", "").replaceAll("?", "");
}

export function globMatches(pattern: string, value: string): boolean {
  return globMatcher(pattern)(value);
}

export function globMatcher(pattern: string): (value: string) => boolean {
  let regex: RegExp;
  try {
    regex = toGlobRegex(pattern);
  } catch {
    return () => false;
  }

  return (value) => regex.test(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function truncateAroundPattern(
  value: string,
  pattern: string,
  contextSize = 10,
): string {
  if (
    pattern.trim() === "" ||
    value.length <= contextSize * 2 + pattern.length
  ) {
    return value;
  }

  const literal = removeGlob(pattern);
  if (literal === "") return value;

  const match = new RegExp(escapeRegex(literal), "i").exec(value);
  if (match === null) return value;

  const start = Math.max(match.index - contextSize, 0);
  const end = Math.min(
    match.index + match[0].length + contextSize,
    value.length,
  );

  const prefix = start > 0 ? "..." : "";
  const suffix = end < value.length ? "..." : "";

  return prefix + value.slice(start, end) + suffix;
}

export function splitOnMatch(
  value: string,
  literal: string,
): { text: string; match: boolean }[] {
  if (literal === "") return [{ text: value, match: false }];

  const segments: { text: string; match: boolean }[] = [];
  const regex = new RegExp(escapeRegex(literal), "gi");
  let cursor = 0;

  for (const match of value.matchAll(regex)) {
    if (match.index > cursor) {
      segments.push({ text: value.slice(cursor, match.index), match: false });
    }
    segments.push({ text: match[0], match: true });
    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) {
    segments.push({ text: value.slice(cursor), match: false });
  }

  return segments;
}
