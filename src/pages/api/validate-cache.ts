import axios from "axios";
import type { NextApiRequest, NextApiResponse } from "next";
import { load } from "cheerio";
import { backOff } from "exponential-backoff";
import {
  cacheValidationRequestBodySchema,
  type CacheValidationResponseData,
} from "~/lib/api-types";

// to limit concurrency with promises
import pLimit from "p-limit";
const limit = pLimit(5);

// Function: handler
// Description: The main handler function for the cache validation API.
// Parameters: req: NextApiRequest, res: NextApiResponse<CacheValidationResponseData>
// Returns: Promise<void>
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CacheValidationResponseData>,
) {
  const visitedUrls = new Set<string>();
  const imgUrls = new Set<string>();
  const { url } = cacheValidationRequestBodySchema.parse(req.body);
  await visitUrl(url, res, visitedUrls, imgUrls);

  setTimeout(() => {
    console.log("Waiting for 5 seconds before starting images...");
  }, 5000);

  const cacheHeader = "x-vercel-cache";

  const acceptHeaders = [
    "image/avif,image/webp,image/jpeg,image/png,image/*,*/*;q=0.8",
    // "image/webp,image/jpeg,image/png,image/*,*/*;q=0.8",
    // "image/jpeg,image/png,image/*,*/*;q=0.8",
    // "image/png,image/*,*/*;q=0.8",
  ];

  const imgUrlsArray = Array.from(imgUrls);

  await Promise.all(
    acceptHeaders.map(async (acceptHeader) => {
      await validateImages(imgUrlsArray, acceptHeader, cacheHeader, res);
    }),
  );

  res.status(200).end();
  return;
}

// Function: visitUrl
// Description: Recursively visits a URL and crawls the page for images and links.
// Parameters: url: string, res: NextApiResponse<CacheValidationResponseData>, visitedUrls: Set<string>, imgUrls: Set<string>
// Returns: Promise<void>
const visitUrl = async (
  url: string,
  res: NextApiResponse<CacheValidationResponseData>,
  visitedUrls: Set<string>,
  imgUrls: Set<string>,
) => {
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
  res.write(JSON.stringify(initialResponseData));

  const urlObject = new URL(url);

  const request = async () => {
    return axios.get(url);
  };

  const options = {
    numOfAttempts: 3,
    startingDelay: 1000,
    timeMultiple: 2,
  };

  const response = await backOff(request, options);

  const cacheHeader = "x-vercel-cache";
  const cache = response.headers[cacheHeader] as string;
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
      cacheStatus === "HIT"
        ? "SUCCESS"
        : cacheStatus === "ERROR"
          ? "ERROR"
          : "WARNING",
    type: "head",
    head: {
      url,
      type: "PAGE",
      status: "DONE",
      cache: cacheStatus,
    },
  };
  res.write(JSON.stringify(responseData));

  const html = response.data as string;
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
      // const href = $(link).attr("href");
      // if (href) {
      //   const absoluteUrl = new URL(href, url).toString();
      //   if (!visitedUrls.has(absoluteUrl)) {
      //     visitedUrls.add(absoluteUrl);
      //     await visitUrl(absoluteUrl, res);
      //   }
      // }
      const href = $(link).attr("href")?.split("#")[0];
      if (href) {
        const resolvedUrl = resolveUrl(url, href);
        const parsedUrl = new URL(resolvedUrl);
        if (
          parsedUrl.hostname === urlObject.origin &&
          !visitedUrls.has(resolvedUrl)
        ) {
          visitedUrls.add(resolvedUrl);
          // console.log(`Visiting URL: ${resolvedUrl}\n\n`);
          await visitUrl(resolvedUrl, res, visitedUrls, imgUrls);
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

  return;
};

// Function: validateImages
// Description: Validates a list of image URLs using the provided accept and cache headers.
// Parameters: imgUrls: string[], acceptHeader: string, cacheHeader: string, res: NextApiResponse<CacheValidationResponseData>
// Returns: Promise<void>
const validateImages = async (
  imgUrls: string[],
  acceptHeader: string,
  cacheHeader: string,
  res: NextApiResponse<CacheValidationResponseData>,
) => {
  const promises = imgUrls.map(async (imgUrl) => {
    await limit(validateImage, imgUrl, acceptHeader, cacheHeader, res);
  });
  await Promise.all(promises);
  return;
};

// Function: validateImage
// Description: Validates a single image URL using the provided accept and cache headers.
// Parameters: url: string, acceptHeader: string, cacheHeader: string, res: NextApiResponse<CacheValidationResponseData>
// Returns: Promise<void>
const validateImage = async (
  url: string,
  acceptHeader: string,
  cacheHeader: string,
  res: NextApiResponse<CacheValidationResponseData>,
) => {
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
  res.write(JSON.stringify(initialResponseData));

  const request = async () => {
    return axios.head(url, {
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
  const cache = response.headers[cacheHeader] as string;
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
      cacheStatus === "HIT"
        ? "SUCCESS"
        : cacheStatus === "ERROR"
          ? "ERROR"
          : "WARNING",
    type: "head",
    head: {
      url,
      type: "IMG",
      status: "DONE",
      cache: cacheStatus,
    },
  };
  res.write(JSON.stringify(responseData));
  return;
};

// Function: resolveUrl
// Description: Resolves a URL with a hostname and a relative path if necessary.
// Parameters: hostname: string, url: string
// Returns: string
const resolveUrl = (hostname: string, url: string) => {
  const urlObject = URL.canParse(url) ? new URL(url) : new URL(url, hostname);
  return urlObject.toString();
};
