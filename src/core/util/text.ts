const PLURALS: Record<string, string> = {
  message: "messages",
  queue: "queues",
  connection: "connections",
  vhost: "vhosts",
  "virtual host": "virtual hosts",
};

function pluralize(count: number, singular: string): string {
  if (count === 1) return singular;
  return PLURALS[singular] ?? `${singular}s`;
}

export function formatCount(count: number, singular: string): string {
  return `${count} ${pluralize(count, singular)}`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
