import { backOff } from "exponential-backoff";
import { type CacheValidationResponseData } from "~/lib/api-types";

// to limit concurrency with promises
import pLimit from "p-limit";
const limit = pLimit(50);

// Function: validateImages
// Description: Validates a list of image URLs using the provided accept and cache headers.
// Parameters: imgUrls: string[], acceptHeader: string, cacheHeader: string, res: WritableStreamDefaultWriter
// Returns: Promise<void>
export const validateImages = async (
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
    console.error("validateImages Error: ", error);
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
export const validateImage = async (
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
    console.error("validateImage Error: ", error);
    sendData({
      time: new Date().toISOString(),
      level: "ERROR",
      type: "message",
      message: error.message,
    });
  }
  return;
};
