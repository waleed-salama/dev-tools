import { z } from "zod";
import { type CloudProvider } from "./cloudProviders";

export const cacheValidationRequestBodySchema = z.object({
  url: z.string().url(),
  formats: z.array(z.string()),
  preferredProvider: z.custom<CloudProvider>().nullable(),
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
      acceptHeader: z.string().optional(),
      cloudProviderName: z.string().optional().nullable(),
      cacheResult: z.union([
        z.literal("CACHED"),
        z.literal("UNCACHED"),
        z.literal("OTHER"),
        z.literal(""),
        z.literal("ERROR"),
      ]),
      cacheStatus: z.string().nullable().optional(),
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
  preferredProvider: z.custom<CloudProvider>().nullable(),
});

export type ImageSubsetValidationRequestParameters = z.infer<
  typeof imageSubsetValidationRequestSchema
>;
