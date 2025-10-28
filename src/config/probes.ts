import { readFile } from "node:fs/promises";
import { z } from "zod";

export type ProbeDef = {
  id: string;
  name?: string;
  url: string;
  type?: string;
  component?: string;
  group?: string;
  sla_ms?: number;
  enabled: boolean;
  // keep the raw assert for later (unused in v0.3 logging-only)
  assert?: unknown;
};

const ProbeSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  url: z.string().url(),
  type: z.string().optional(),
  component: z.string().optional(),
  group: z.string().optional(),
  sla_ms: z.number().optional(),
  enabled: z.boolean().default(true),
  assert: z.unknown().optional()
});

const ProbesFileSchema = z.object({
  probes: z.array(ProbeSchema)
});

export async function loadProbes(filePath: string): Promise<ProbeDef[]> {
  const raw = await readFile(filePath, "utf8");
  const parsed = ProbesFileSchema.parse(JSON.parse(raw));
  return parsed.probes.filter(p => p.enabled !== false);
}
