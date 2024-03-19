import { load } from "cheerio";
import { backOff } from "exponential-backoff";
import {
  cacheValidationRequestBodySchema,
  cacheValidationResponseDataSchema,
  type CacheValidationResponseData,
  type ImageSubsetValidationRequestParameters,
} from "~/lib/api-types";
import { type CloudProvider } from "~/lib/cloudProviders";
import chunk from "lodash.chunk";
import { validateImages } from "~/lib/validate-images";
import processHeaders from "~/lib/processHeaders";

// To use edge runtime on Vercel
export const runtime = "edge";
export const dynamic = "force-dynamic";

// Function: handler
// Description: The main handler function for the cache validation API.
// Parameters: req: Request, res: WritableStreamDefaultWriter
// Returns: Promise<void>
export async function POST(req: Request) {
  try {
    const encoder = new TextEncoder();

    let streamOpen = true;

    const stream = new ReadableStream({
      async start(controller) {
        const sendData = (data: CacheValidationResponseData) => {
          if (streamOpen)
            try {
              controller.enqueue(encoder.encode(JSON.stringify(data)));
            } catch (e: unknown) {
              const error = e as Error;
              console.error("sendData Error: ", error);
            }
        };

        console.log("Stream started");
        try {
          const { url, formats, preferredProvider } =
            cacheValidationRequestBodySchema.parse(await req.json());
          const baseUrl = new URL(req.url).origin;

          const acceptHeaders = formats.map((format) => `image/${format}`);
          const { visitedUrls, imgUrls } = await processUrl(
            url,
            preferredProvider,
            acceptHeaders,
            sendData,
            baseUrl,
            streamOpen,
          );
          sendData({
            time: new Date().toISOString(),
            id: crypto.randomUUID(),
            level: "INFO",
            type: "message",
            message: `Done. Visited ${visitedUrls.size} pages and checked ${imgUrls.size * acceptHeaders.length} images (${imgUrls.size} images/variants x ${acceptHeaders.length} formats).`,
          });
        } catch (e: unknown) {
          const error = e as Error;
          console.error(error);
          sendData({
            time: new Date().toISOString(),
            id: crypto.randomUUID(),
            level: "ERROR",
            type: "message",
            message: error.message,
          });
        }
        controller.close();
      },

      async cancel() {
        console.log("Stream cancelled");
        streamOpen = false;
      },
    });

    return new Response(stream);
  } catch (e: unknown) {
    const error = e as Error;
    console.error(error);
    return new Response(error.message, { status: 500 });
  }
}

const processUrl = async (
  url: string,
  preferredProvider: CloudProvider | null,
  acceptHeaders: string[],
  sendData: (data: CacheValidationResponseData) => void,
  baseUrl: string,
  streamOpen: boolean,
) => {
  if (streamOpen)
    try {
      const visitedUrls = new Set<string>();
      const imgUrls = new Set<string>();
      visitedUrls.add(url);
      await visitUrl(
        url,
        sendData,
        preferredProvider,
        visitedUrls,
        imgUrls,
        streamOpen,
      );

      const imgUrlsArray = Array.from(imgUrls);

      const processInWorker =
        imgUrlsArray.length * acceptHeaders.length + visitedUrls.size > 800
          ? true
          : false;

      await Promise.all(
        acceptHeaders.map(async (acceptHeader) => {
          if (processInWorker)
            await validateImagesInWorker(
              imgUrlsArray,
              acceptHeader,
              preferredProvider,
              sendData,
              baseUrl,
              streamOpen,
            );
          else
            await validateImages(
              imgUrlsArray,
              acceptHeader,
              preferredProvider,
              sendData,
              streamOpen,
            );
        }),
      );

      return { visitedUrls, imgUrls };
    } catch (e: unknown) {
      const error = e as Error;
      console.error("processUrl Error: ", error);
      sendData({
        time: new Date().toISOString(),
        id: crypto.randomUUID(),
        level: "ERROR",
        type: "message",
        message: error.message,
      });
      return { visitedUrls: new Set<string>(), imgUrls: new Set<string>() };
    }
  else return { visitedUrls: new Set<string>(), imgUrls: new Set<string>() };
};

// Function: visitUrl
// Description: Recursively visits a URL and crawls the page for images and links.
// Parameters: url: string, res: WritableStreamDefaultWriter, visitedUrls: Set<string>, imgUrls: Set<string>
// Returns: Promise<void>
const visitUrl = async (
  url: string,
  sendData: (data: CacheValidationResponseData) => void,
  preferredProvider: CloudProvider | null,
  visitedUrls: Set<string>,
  imgUrls: Set<string>,
  streamOpen: boolean,
) => {
  if (streamOpen)
    try {
      const id = crypto.randomUUID();
      const initialResponseData: CacheValidationResponseData = {
        time: new Date().toISOString(),
        id,
        level: "INFO",
        type: "head",
        head: {
          url,
          type: "PAGE",
          status: "PENDING",
          cacheResult: "",
        },
      };
      sendData(initialResponseData);

      const urlObject = new URL(url);

      const request = async () => {
        return fetch(url);
      };
      let retries = 0;

      const options = {
        numOfAttempts: 3,
        startingDelay: 1000,
        timeMultiple: 2,
        retry: (e: unknown, attemptNumber: number) => {
          const error = e as Error;
          console.error(
            `Attempt to fetch ${url} failed. Error: ${error.message}. Retrying ${attemptNumber}...`,
          );
          sendData({
            time: new Date().toISOString(),
            id,
            level: "ERROR",
            type: "head",
            head: {
              type: "PAGE",
              url,
              status: "PENDING",
              cacheResult: "",
            },
            message: `Attempt to fetch ${url} failed. Error: ${error.message}. Retrying ${attemptNumber}...`,
          });
          retries = attemptNumber;
          return true;
        },
      };

      const response = await backOff(request, options);

      // Check the headers of the response to determine the cache status and content type
      const { cacheResult, cacheStatus, cloudProvider, contentType, logLevel } =
        processHeaders(response.headers, preferredProvider);
      const messages: string[] = [];
      if (response.status >= 400) {
        messages.push(response.statusText);
      }
      if (cacheStatus === null) {
        messages.push("No Cache Header");
      }
      if (retries > 0) {
        messages.push(`Retried ${retries} time${retries > 1 ? "s" : ""}`);
      }
      const responseData: CacheValidationResponseData = {
        time: new Date().toISOString(),
        id,
        level: response.status >= 400 ? "ERROR" : logLevel,
        type: "head",
        head: {
          url,
          type: "PAGE",
          responseStatus: response.status,
          contentType: contentType,
          acceptHeader: "text/html",
          cloudProviderName: cloudProvider?.name,
          status: "DONE",
          cacheResult,
        },
        message: messages.join("\n"),
      };
      sendData(responseData);

      const html = await response.text();
      const $ = load(html);

      // Start crawling images on the page
      $("img").each((index, element) => {
        const srcset = $(element).attr("srcset");
        if (srcset) {
          const srcUrls = srcset
            .split(",")
            .map((entry) => entry.trim().split(" ")[0]);
          srcUrls.forEach((imgUrl) => {
            if (typeof imgUrl !== "string") return;
            // console.debug(
            //   "Image URL:" + resolveUrl(urlObject.origin, imgUrl),
            // );
            imgUrls.add(resolveUrl(urlObject.origin, imgUrl));
          });
        }

        const src = $(element).attr("src");
        if (src) {
          // Check for base64 encoded images
          if (src.startsWith("data:image")) return;
          // console.debug("Image URL: " + resolveUrl(urlObject.origin, src));
          imgUrls.add(resolveUrl(urlObject.origin, src));
        }
      });

      // Start crawling links on the page
      const links = $("a");
      await Promise.all(
        links.map(async (index, link) => {
          const href = $(link).attr("href")?.split("#")[0];
          if (href) {
            const resolvedUrl = resolveUrl(url, href);
            const parsedUrl = new URL(resolvedUrl);
            if (
              parsedUrl.origin === urlObject.origin &&
              !visitedUrls.has(resolvedUrl)
            ) {
              visitedUrls.add(resolvedUrl);
              // console.log(`Visiting URL: ${resolvedUrl}\n\n`);
              await visitUrl(
                resolvedUrl,
                sendData,
                preferredProvider,
                visitedUrls,
                imgUrls,
                streamOpen,
              );
            } else if (parsedUrl.hostname !== urlObject.origin) {
              // console.debug(
              //   `Skipping external URL: ${resolvedUrl}. Hostname: ${parsedUrl.hostname}, Base domain: ${urlObject.origin}\n\n`,
              // );
            } else if (visitedUrls.has(resolvedUrl)) {
              // console.debug(`Skipping already visited URL: ${resolvedUrl}\n\n`);
            } else {
              // console.debug(`Skipping URL for unknown reason: ${resolvedUrl}\n\n`);
            }
          }
        }),
      );
    } catch (e: unknown) {
      const error = e as Error;
      console.error("visitUrl Error: ", error);
      sendData({
        time: new Date().toISOString(),
        id: crypto.randomUUID(),
        level: "ERROR",
        type: "message",
        message: error.message,
      });
    }
  return;
};

// Function: resolveUrl
// Description: Resolves a URL with a hostname and a relative path if necessary.
// Parameters: hostname: string, url: string
// Returns: string
const resolveUrl = (hostname: string, url: string) => {
  try {
    const urlObject = URL.canParse(url) ? new URL(url) : new URL(url, hostname);
    return urlObject.toString();
  } catch (e) {
    console.error("resolveUrl Error: ", e);
    return url;
  }
};

// Function: validateImagesInWorker
// Description: Validates a list of image URLs using a new edge worker.
// Parameters: imgUrls: string[], acceptHeader: string, cloudProvider: Provider, sendData: (data: CacheValidationResponseData) => void
// Returns: Promise<void>
const validateImagesInWorker = async (
  imgUrls: string[],
  acceptHeader: string,
  preferredProvider: CloudProvider | null,
  sendData: (data: CacheValidationResponseData) => void,
  baseUrl: string,
  streamOpen: boolean,
) => {
  if (streamOpen)
    try {
      const imgUrlsSubsets = chunk(imgUrls, 500);
      await Promise.all(
        imgUrlsSubsets.map(
          async (subset) =>
            await validateImagesSubsetInWorker(
              subset,
              acceptHeader,
              preferredProvider,
              sendData,
              baseUrl,
              streamOpen,
            ),
        ),
      );
      console.log("All subsets complete");
    } catch (e: unknown) {
      const error = e as Error;
      console.error("validateImagesInWorker Error: ", error);
      sendData({
        time: new Date().toISOString(),
        id: crypto.randomUUID(),
        level: "ERROR",
        type: "message",
        message: error.message,
      });
    }
  return;
};

// Function: validateImagesSubsetInWorker
// Description: Validates a subset of image URLs using a new edge worker.
// Parameters: imgUrls: string[], acceptHeader: string, cloudProvider: Provider, sendData: (data: CacheValidationResponseData) => void
// Returns: Promise<void>
const validateImagesSubsetInWorker = async (
  imgUrls: string[],
  acceptHeader: string,
  preferredProvider: CloudProvider | null,
  sendData: (data: CacheValidationResponseData) => void,
  baseUrl: string,
  streamOpen: boolean,
) => {
  if (streamOpen)
    try {
      const workerUrl = `${baseUrl}/api/validate-images`;
      const parameters: ImageSubsetValidationRequestParameters = {
        imgUrls,
        acceptHeader,
        preferredProvider,
      };
      const options = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parameters),
      };
      let incompleteData = "";

      await fetch(workerUrl, options).then(async (response) => {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No reader found");
        }

        const read = async () => {
          await reader
            .read()
            .then(async ({ done, value }) => {
              if (done) {
                const finalValue = new TextDecoder().decode(value);
                console.info("Subset complete", finalValue);
                if (incompleteData) {
                  console.log("Incomplete data: ", incompleteData);
                }
                return;
              }
              const decoder = new TextDecoder();
              const decodedValue = decoder.decode(value);
              // console.log(decodedValue);
              const text = incompleteData + decodedValue;
              incompleteData = "";
              // sometimes the response is two json objects together, so we need to split them. Also, sometimes a single json object is split over two parts.
              const split = text.split("}{");
              if (split.length > 1) {
                split.forEach((s, index) => {
                  const json =
                    index === 0
                      ? `${s}}`
                      : index === split.length - 1
                        ? `{${s}`
                        : `{${s}}`;
                  try {
                    const data = cacheValidationResponseDataSchema.parse(
                      JSON.parse(json),
                    );
                    sendData(data);
                  } catch (error) {
                    incompleteData += json;
                  }
                });
              } else {
                try {
                  const data = cacheValidationResponseDataSchema.parse(
                    JSON.parse(text),
                  );
                  sendData(data);
                } catch (error) {
                  incompleteData += text;
                }
              }
              await read();
            })
            .catch((error) => {
              console.error(error);
            });
        };
        await read();
      });
    } catch (e: unknown) {
      const error = e as Error;
      console.error("validateImagesSubsetInWorker Error: ", error);
      sendData({
        time: new Date().toISOString(),
        id: crypto.randomUUID(),
        level: "ERROR",
        type: "message",
        message: error.message,
      });
    }
  return;
};
