import { z } from "zod";

export const PREFERENCES_ID = "preferences";

export const PreferencesSchema = z.object({
  id: z.literal(PREFERENCES_ID).default(PREFERENCES_ID),
  messagePageSize: z.number().int().min(10).max(10_000).default(200),
  searchDepth: z.number().int().min(10).max(100_000).default(200),
  searchConcurrency: z.number().int().min(1).max(32).default(4),
  publishConcurrency: z.number().int().min(1).max(64).default(16),
  queueConcurrency: z.number().int().min(1).max(32).default(4),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

export function defaultPreferences(): Preferences {
  return PreferencesSchema.parse({});
}
