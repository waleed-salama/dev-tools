import { z } from "zod";

export const cacheValidationRequestBodySchema = z.object({
  url: z.string().url(),
});

export type CacheValidationRequestBody = z.infer<
  typeof cacheValidationRequestBodySchema
>;

export const cacheValidationResponseDataSchema = z.object({
  time: z.string().datetime(),
  level: z.union([
    z.literal("VERBOSE"),
    z.literal("INFO"),
    z.literal("SUCCESS"),
    z.literal("WARNING"),
    z.literal("ERROR"),
  ]),
  type: z.union([z.literal("head"), z.literal("message")]),
  head: z
    .object({
      url: z.string().url(),
      type: z.union([z.literal("PAGE"), z.literal("IMG"), z.literal("OTHER")]),
      status: z.string(),
      responseStatus: z.number().optional(),
      cache: z.union([
        z.literal("HIT"),
        z.literal("MISS"),
        z.literal("STALE"),
        z.literal(""),
        z.literal("ERROR"),
      ]),
    })
    .optional(),
  message: z.string().optional(),
});

export type CacheValidationResponseData = z.infer<
  typeof cacheValidationResponseDataSchema
>;
