import type { Message } from "../domain/message.ts";
import { errorMessage } from "../util/text.ts";

export interface LiteralQuery {
  readonly kind: "literal";
  readonly raw: string;
  readonly needle: string;
}

export interface PathQuery {
  readonly kind: "path";
  readonly raw: string;
  readonly path: readonly string[];
  readonly needle: string;
}

export interface RegexQuery {
  readonly kind: "regex";
  readonly raw: string;
  readonly regex: RegExp;
}

export interface InvalidQuery {
  readonly kind: "invalid";
  readonly raw: string;
  readonly reason: string;
}

export type Query = LiteralQuery | PathQuery | RegexQuery;

export type ParsedQuery = Query | InvalidQuery;

export const REGEX_PREFIX = "re:";

const PATH_EXPRESSION = /^([A-Za-z_$][\w$-]*(?:\.(?:[A-Za-z_$][\w$-]*|\d+|\*))*):(.+)$/s;

export function stripJsonWhitespace(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (const character of text) {
    if (escaped) {
      result += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      result += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      result += character;
      continue;
    }
    if (!inString && (character === " " || character === "\n" || character === "\r" || character === "\t")) {
      continue;
    }
    result += character;
  }

  return result;
}

export function parseQuery(input: string): ParsedQuery {
  const raw = input.trim();

  if (raw === "") {
    return { kind: "invalid", raw, reason: "Enter something to search for." };
  }

  if (raw.toLowerCase().startsWith(REGEX_PREFIX)) {
    const pattern = raw.slice(REGEX_PREFIX.length).trim();
    if (pattern === "") {
      return { kind: "invalid", raw, reason: "Add a pattern after 're:'." };
    }

    try {
      return { kind: "regex", raw, regex: new RegExp(pattern, "i") };
    } catch (error) {
      return {
        kind: "invalid",
        raw,
        reason: `Invalid regular expression: ${errorMessage(error)}`,
      };
    }
  }

  const match = PATH_EXPRESSION.exec(raw);
  if (match !== null) {
    const [, expression, value] = match;
    const needle = (value ?? "").trim();

    if (expression !== undefined && needle !== "" && !needle.startsWith("//")) {
      return {
        kind: "path",
        raw,
        path: expression.split("."),
        needle,
      };
    }
  }

  return { kind: "literal", raw, needle: raw };
}

export function queryHighlight(query: Query): string {
  if (query.kind === "regex") return "";
  return query.needle;
}

export function searchableText(message: Message): string[] {
  return [message.payload, ...fieldsOf(message)];
}

function fieldsOf(message: Message): string[] {
  return [
    message.id,
    message.routingKey,
    message.exchange,
    ...Object.keys(message.headers),
    ...Object.values(message.headers),
    ...Object.keys(message.properties),
    ...Object.values(message.properties),
  ];
}

function containsAny(haystacks: readonly string[], needles: readonly string[]): boolean {
  for (const haystack of haystacks) {
    const lowered = haystack.toLowerCase();
    for (const needle of needles) {
      if (lowered.includes(needle)) return true;
    }
  }
  return false;
}

function needleVariants(needle: string): string[] {
  const lowered = needle.toLowerCase();
  const stripped = stripJsonWhitespace(lowered);
  return stripped === lowered ? [lowered] : [lowered, stripped];
}

function payloadVariants(payload: string): string[] {
  const stripped = stripJsonWhitespace(payload);
  return stripped === payload ? [payload] : [payload, stripped];
}

function descend(value: unknown, segment: string, into: unknown[]): void {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    if (segment === "*") {
      into.push(...value);
      return;
    }

    const index = Number(segment);
    if (Number.isInteger(index) && index >= 0) {
      if (index < value.length) into.push(value[index]);
      return;
    }

    for (const entry of value) descend(entry, segment, into);
    return;
  }

  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (segment === "*") {
    into.push(...Object.values(record));
    return;
  }

  if (Object.hasOwn(record, segment)) into.push(record[segment]);
}

export function valuesAtPath(root: unknown, path: readonly string[]): unknown[] {
  let current: unknown[] = [root];

  for (const segment of path) {
    const next: unknown[] = [];
    for (const value of current) descend(value, segment, next);
    if (next.length === 0) return [];
    current = next;
  }

  return current;
}

function leafText(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

type PayloadParser = (message: Message) => unknown;

function createPayloadParser(): PayloadParser {
  const cache = new WeakMap<Message, { readonly value: unknown }>();

  return (message) => {
    const cached = cache.get(message);
    if (cached !== undefined) return cached.value;

    let value: unknown;
    try {
      value = JSON.parse(message.payload);
    } catch {
      value = undefined;
    }

    cache.set(message, { value });
    return value;
  };
}

function sameLeaf(candidate: unknown, pattern: unknown): boolean {
  if (candidate === pattern) return true;
  if (candidate === null || pattern === null) return false;
  if (typeof candidate === "object" || typeof pattern === "object") return false;
  return String(candidate).toLowerCase() === String(pattern).toLowerCase();
}

function isSubset(candidate: unknown, pattern: unknown): boolean {
  if (Array.isArray(pattern)) {
    if (!Array.isArray(candidate)) return false;
    return pattern.every((wanted) =>
      candidate.some((entry) => isSubset(entry, wanted)),
    );
  }

  if (pattern !== null && typeof pattern === "object") {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      return false;
    }

    const record = candidate as Record<string, unknown>;
    return Object.entries(pattern as Record<string, unknown>).every(
      ([key, wanted]) => Object.hasOwn(record, key) && isSubset(record[key], wanted),
    );
  }

  return sameLeaf(candidate, pattern);
}

function containsSubtree(root: unknown, pattern: unknown): boolean {
  if (isSubset(root, pattern)) return true;
  if (root === null || typeof root !== "object") return false;

  const children = Array.isArray(root)
    ? root
    : Object.values(root as Record<string, unknown>);

  return children.some((child) => containsSubtree(child, pattern));
}

function structuralMatcher(
  text: string,
  parse: PayloadParser,
): ((message: Message) => boolean) | null {
  let pattern: unknown;
  try {
    pattern = JSON.parse(text);
  } catch {
    return null;
  }

  if (pattern === null || typeof pattern !== "object") return null;

  return (message) => {
    const parsed = parse(message);
    return parsed === undefined ? false : containsSubtree(parsed, pattern);
  };
}

function literalMatcher(
  text: string,
  parse: PayloadParser,
): (message: Message) => boolean {
  const needles = needleVariants(text);
  const structural = structuralMatcher(text, parse);

  return (message) => {
    if (containsAny(payloadVariants(message.payload), needles)) return true;
    if (containsAny(fieldsOf(message), needles)) return true;
    return structural !== null && structural(message);
  };
}

export function compileQuery(query: Query): (message: Message) => boolean {
  if (query.kind === "regex") {
    const { regex } = query;
    return (message) =>
      regex.test(message.payload) ||
      fieldsOf(message).some((field) => regex.test(field));
  }

  const parse = createPayloadParser();

  if (query.kind === "literal") return literalMatcher(query.needle, parse);

  const fallback = literalMatcher(query.raw, parse);
  const { path } = query;
  const headerPath = path.join(".");
  const lowered = query.needle.toLowerCase();

  return (message) => {
    const parsed = parse(message);

    if (parsed !== undefined) {
      for (const value of valuesAtPath(parsed, path)) {
        if (leafText(value).toLowerCase().includes(lowered)) return true;
      }
    }

    const header = message.headers[headerPath] ?? message.properties[headerPath];
    if (header !== undefined && header.toLowerCase().includes(lowered)) return true;

    return fallback(message);
  };
}

export function messageMatcher(term: string): (message: Message) => boolean {
  const parsed = parseQuery(term);
  if (parsed.kind === "invalid") return () => false;
  return compileQuery(parsed);
}
