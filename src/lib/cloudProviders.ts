import { z } from "zod";

export const cloudProviderSchema = z.object({
  name: z.union([z.literal("Vercel"), z.literal("Cloudflare")]),
  cacheHeader: z.string(),
  hit: z.string(),
  miss: z.string(),
  stale: z.string(),
});
export type CloudProvider = z.infer<typeof cloudProviderSchema>;

const cloudProviders: CloudProvider[] = [
  {
    name: "Vercel",
    cacheHeader: "x-vercel-cache",
    hit: "HIT",
    miss: "MISS",
    stale: "STALE",
  },
  {
    name: "Cloudflare",
    cacheHeader: "cf-cache-status",
    hit: "HIT",
    miss: "MISS",
    stale: "STALE",
  },
];

export default cloudProviders;
