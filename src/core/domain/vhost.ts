import { randomUUID } from "node:crypto";
import { z } from "zod";

export const VHostSchema = z.object({
  id: z.string().default(() => randomUUID()),
  name: z.string(),
  description: z.string().default(""),
  isDefault: z.boolean().default(false),
});

export type VHost = z.infer<typeof VHostSchema>;

export function vHost(
  name: string,
  overrides: Partial<Omit<VHost, "name">> = {},
): VHost {
  return VHostSchema.parse({ name, ...overrides });
}
