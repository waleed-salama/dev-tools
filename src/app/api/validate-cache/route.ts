import { load } from "cheerio";
import { backOff } from "exponential-backoff";
import {
  cacheValidationRequestBodySchema,
  cacheValidationResponseDataSchema,
  type CacheValidationResponseData,
  type ImageSubsetValidationRequestParameters,
} from "~/lib/api-types";
import chunk from "lodash.chunk";
import { validateImages } from "~/lib/validate-images";

// To use edge runtime on Vercel
export const runtime = "edge";
export const dynamic = "force-dynamic";

// Function: handler
// Description: The main handler function for the cache validation API.
// Parameters: req: Request, res: WritableStreamDefaultWriter
// Returns: Promise<void>
export async function POST(req: Request) {
  try {
    const { url, formats } = cacheValidationRequestBodySchema.parse(
      await req.json(),
    );
    const baseUrl = new URL(req.url).origin;

    const cacheHeader = "x-vercel-cache";

    // const acceptHeaders = [
    //   "image/avif,image/webp,image/jpeg,image/png,image/*,*/*;q=0.8",
    //   // "image/webp,image/jpeg,image/png,image/*,*/*;q=0.8",
    //   // "image/jpeg,image/png,image/*,*/*;q=0.8",
    //   // "image/png,image/*,*/*;q=0.8",
    // ];

    const acceptHeaders = formats.map((format) => `image/${format}`);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendData = (data: CacheValidationResponseData) => {
          controller.enqueue(encoder.encode(JSON.stringify(data)));
        };

        console.log("Stream started");
        const { visitedUrls, imgUrls } = await processUrl(
          url,
          cacheHeader,
          acceptHeaders,
          sendData,
          baseUrl,
        );
        sendData({
          time: new Date().toISOString(),
          id: crypto.randomUUID(),
          level: "INFO",
          type: "message",
          message: `Done. Visited ${visitedUrls.size} pages and checked ${imgUrls.size * acceptHeaders.length} images (${imgUrls.size} images/variants x ${acceptHeaders.length} formats).`,
        });
        controller.close();
      },

      async cancel() {
        console.log("Stream cancelled");
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
  cacheHeader: string,
  acceptHeaders: string[],
  sendData: (data: CacheValidationResponseData) => void,
  baseUrl: string,
) => {
  try {
    const visitedUrls = new Set<string>();
    const imgUrls = new Set<string>();
    visitedUrls.add(url);
    await visitUrl(url, sendData, visitedUrls, imgUrls);

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
            cacheHeader,
            sendData,
            baseUrl,
          );
        else
          await validateImages(
            imgUrlsArray,
            acceptHeader,
            cacheHeader,
            sendData,
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
};

// Function: visitUrl
// Description: Recursively visits a URL and crawls the page for images and links.
// Parameters: url: string, res: WritableStreamDefaultWriter, visitedUrls: Set<string>, imgUrls: Set<string>
// Returns: Promise<void>
const visitUrl = async (
  url: string,
  sendData: (data: CacheValidationResponseData) => void,
  visitedUrls: Set<string>,
  imgUrls: Set<string>,
) => {
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
        cache: "",
      },
    };
    sendData(initialResponseData);

    const urlObject = new URL(url);

    const request = async () => {
      return fetch(url);
    };

    const options = {
      numOfAttempts: 3,
      startingDelay: 1000,
      timeMultiple: 2,
    };

    const response = await backOff(request, options);

    const cacheHeader = "x-vercel-cache";
    const cache = response.headers.get(cacheHeader);
    const cacheStatus =
      cache === "HIT"
        ? "HIT"
        : cache === "MISS"
          ? "MISS"
          : cache === "STALE"
            ? "STALE"
            : "ERROR";

    const contentType = response.headers.get("content-type");
    const responseData: CacheValidationResponseData = {
      time: new Date().toISOString(),
      id,
      level:
        response.status >= 400
          ? "ERROR"
          : cacheStatus === "HIT"
            ? "SUCCESS"
            : cacheStatus === "ERROR"
              ? "ERROR"
              : "WARNING",
      type: "head",
      head: {
        url,
        type: "PAGE",
        contentType: contentType,
        responseStatus: response.status,
        status: "DONE",
        cache: cacheStatus,
      },
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
            await visitUrl(resolvedUrl, sendData, visitedUrls, imgUrls);
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
    console.error(e);
    return url;
  }
};

// Function: validateImagesInWorker
// Description: Validates a list of image URLs using a new edge worker.
// Parameters: imgUrls: string[], acceptHeader: string, cacheHeader: string, sendData: (data: CacheValidationResponseData) => void
// Returns: Promise<void>
const validateImagesInWorker = async (
  imgUrls: string[],
  acceptHeader: string,
  cacheHeader: string,
  sendData: (data: CacheValidationResponseData) => void,
  baseUrl: string,
) => {
  try {
    const imgUrlsSubsets = chunk(imgUrls, 500);
    await Promise.all(
      imgUrlsSubsets.map(
        async (subset) =>
          await validateImagesSubsetInWorker(
            subset,
            acceptHeader,
            cacheHeader,
            sendData,
            baseUrl,
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
// Parameters: imgUrls: string[], acceptHeader: string, cacheHeader: string, sendData: (data: CacheValidationResponseData) => void
// Returns: Promise<void>
const validateImagesSubsetInWorker = async (
  imgUrls: string[],
  acceptHeader: string,
  cacheHeader: string,
  sendData: (data: CacheValidationResponseData) => void,
  baseUrl: string,
) => {
  try {
    const workerUrl = `${baseUrl}/api/validate-images`;
    const parameters: ImageSubsetValidationRequestParameters = {
      imgUrls,
      acceptHeader,
      cacheHeader,
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
