import { z } from "zod";
import { type CloudProvider } from "./cloudProviders";

export const cacheValidationRequestBodySchema = z.object({
  url: z.string().url(),
  formats: z.array(z.string()),
  cloudProvider: z.custom<CloudProvider>(),
});

export type CacheValidationRequestBody = z.infer<
  typeof cacheValidationRequestBodySchema
>;

export const cacheValidationResponseDataSchema = z.object({
  time: z.string().datetime(),
  id: z.string(),
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
      contentType: z.string().nullable().optional(),
      contentTypeMismatch: z.boolean().optional(),
      acceptHeader: z.string().optional(),
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

export const imageSubsetValidationRequestSchema = z.object({
  imgUrls: z.array(z.string().url()),
  acceptHeader: z.string(),
  cloudProvider: z.custom<CloudProvider>(),
});

export type ImageSubsetValidationRequestParameters = z.infer<
  typeof imageSubsetValidationRequestSchema
>;
