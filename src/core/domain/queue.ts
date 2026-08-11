import { z } from "zod";

export const QueueSchema = z.object({
  name: z.string(),
  vhost: z.string(),
  messagesReady: z.number().default(0),
  messagesUnacknowledged: z.number().default(0),
});

export type Queue = z.infer<typeof QueueSchema>;

export function totalMessages(queue: Queue): number {
  return queue.messagesReady + queue.messagesUnacknowledged;
}
