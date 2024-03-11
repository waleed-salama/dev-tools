import { load } from "cheerio";
import { backOff } from "exponential-backoff";
import {
  cacheValidationRequestBodySchema,
  type CacheValidationResponseData,
} from "~/lib/api-types";

// To use edge runtime on Vercel
export const runtime = "edge";
export const dynamic = "force-dynamic";

// to limit concurrency with promises
import pLimit from "p-limit";
const limit = pLimit(50);

// Function: handler
// Description: The main handler function for the cache validation API.
// Parameters: req: Request, res: WritableStreamDefaultWriter
// Returns: Promise<void>
export async function POST(req: Request) {
  try {
    const { url } = cacheValidationRequestBodySchema.parse(await req.json());

    const cacheHeader = "x-vercel-cache";

    const acceptHeaders = [
      "image/avif,image/webp,image/jpeg,image/png,image/*,*/*;q=0.8",
      // "image/webp,image/jpeg,image/png,image/*,*/*;q=0.8",
      // "image/jpeg,image/png,image/*,*/*;q=0.8",
      // "image/png,image/*,*/*;q=0.8",
    ];

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
        );
        sendData({
          time: new Date().toISOString(),
          level: "INFO",
          type: "message",
          message: `Done. Visited ${visitedUrls.size} pages and checked ${imgUrls.size * acceptHeaders.length} images (${imgUrls.size} images/variants x ${acceptHeaders.length} formats).`,
        });
        controller.close();
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
) => {
  try {
    const visitedUrls = new Set<string>();
    const imgUrls = new Set<string>();
    await visitUrl(url, sendData, visitedUrls, imgUrls);

    const imgUrlsArray = Array.from(imgUrls);

    await Promise.all(
      acceptHeaders.map(async (acceptHeader) => {
        await validateImages(imgUrlsArray, acceptHeader, cacheHeader, sendData);
      }),
    );

    return { visitedUrls, imgUrls };
  } catch (e: unknown) {
    const error = e as Error;
    console.error(error);
    sendData({
      time: new Date().toISOString(),
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
    const initialResponseData: CacheValidationResponseData = {
      time: new Date().toISOString(),
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
    const responseData: CacheValidationResponseData = {
      time: new Date().toISOString(),
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
    console.error(error);
    sendData({
      time: new Date().toISOString(),
      level: "ERROR",
      type: "message",
      message: error.message,
    });
  }
  return;
};

// Function: validateImages
// Description: Validates a list of image URLs using the provided accept and cache headers.
// Parameters: imgUrls: string[], acceptHeader: string, cacheHeader: string, res: WritableStreamDefaultWriter
// Returns: Promise<void>
const validateImages = async (
  imgUrls: string[],
  acceptHeader: string,
  cacheHeader: string,
  sendData: (data: CacheValidationResponseData) => void,
) => {
  try {
    // Log the first 10 image URLs followed by  ... then the last 10 image URLs for debugging, each on a new line
    console.debug(
      "\n---------------\nFound " +
        imgUrls.length.toString() +
        " Image URLs: \n" +
        imgUrls.slice(0, 10).join("\n") +
        "\n...\n" +
        imgUrls.slice(-10).join("\n") +
        "\n---------Validating...--------\n",
    );

    const promises = imgUrls.map(async (imgUrl) => {
      await limit(validateImage, imgUrl, acceptHeader, cacheHeader, sendData);
    });
    await Promise.all(promises);
  } catch (e: unknown) {
    const error = e as Error;
    console.error(error);
    sendData({
      time: new Date().toISOString(),
      level: "ERROR",
      type: "message",
      message: error.message,
    });
  }
  return;
};

// Function: validateImage
// Description: Validates a single image URL using the provided accept and cache headers.
// Parameters: url: string, acceptHeader: string, cacheHeader: string, res: WritableStreamDefaultWriter
// Returns: Promise<void>
const validateImage = async (
  url: string,
  acceptHeader: string,
  cacheHeader: string,
  sendData: (data: CacheValidationResponseData) => void,
) => {
  try {
    console.log(`Validating image: ${url}`);
    const initialResponseData: CacheValidationResponseData = {
      time: new Date().toISOString(),
      level: "INFO",
      type: "head",
      head: {
        type: "IMG",
        url,
        status: "PENDING",
        cache: "",
      },
    };
    sendData(initialResponseData);

    const request = async () => {
      return fetch(url, {
        method: "HEAD",
        headers: {
          Accept: acceptHeader,
        },
      });
    };

    const options = {
      numOfAttempts: 3,
      startingDelay: 1000,
      timeMultiple: 2,
    };

    const response = await backOff(request, options);
    const cache = response.headers.get(cacheHeader);
    const cacheStatus =
      cache === "HIT"
        ? "HIT"
        : cache === "MISS"
          ? "MISS"
          : cache === "STALE"
            ? "STALE"
            : "ERROR";
    const responseData: CacheValidationResponseData = {
      time: new Date().toISOString(),
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
        type: "IMG",
        responseStatus: response.status,
        status: "DONE",
        cache: cacheStatus,
      },
    };
    sendData(responseData);
  } catch (e: unknown) {
    const error = e as Error;
    console.error(error);
    sendData({
      time: new Date().toISOString(),
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

// Function: GET
// Description: A testing handler function to test the ReadableStream API and debug streaming issues on vercel edge.
// Parameters: req: Request, params: Record<string, object>
// Returns: Promise<Response>
// export async function GET(req: Request, { params }: Record<string, object>) {
//   try {
//     const { i } = params! as { i: string };
//     const iterations = parseInt(i);
//     const encoder = new TextEncoder();
//     const stream = new ReadableStream({
//       async start(controller) {
//         for (let i = 1; i <= iterations; i++) {
//           await new Promise((resolve) => setTimeout(resolve, 1000));
//           console.log(`Iteration ${i}`);
//           controller.enqueue(encoder.encode(`Hello, world! ${i}\n`));
//         }

//         controller.close();
//       },
//     });

//     return new Response(stream);
//   } catch (e: unknown) {
//     const error = e as Error;
//     console.error(error);
//     return new Response(error.message, { status: 500 });
//   }
// }
