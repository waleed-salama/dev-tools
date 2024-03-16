import { backOff } from "exponential-backoff";
import { type CacheValidationResponseData } from "~/lib/api-types";
import { type CloudProvider } from "./cloudProviders";

// to limit concurrency with promises
import pLimit from "p-limit";
const limit = pLimit(50);

// Function: validateImages
// Description: Validates a list of image URLs using the provided accept and cache headers.
// Parameters: imgUrls: string[], acceptHeader: string, cloudProvider: Provider, res: WritableStreamDefaultWriter
// Returns: Promise<void>
export const validateImages = async (
  imgUrls: string[],
  acceptHeader: string,
  cloudProvider: CloudProvider,
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
      await limit(validateImage, imgUrl, acceptHeader, cloudProvider, sendData);
    });
    await Promise.all(promises);
  } catch (e: unknown) {
    const error = e as Error;
    console.error("validateImages Error: ", error);
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

// Function: validateImage
// Description: Validates a single image URL using the provided accept and cache headers.
// Parameters: url: string, acceptHeader: string, cloudProvider: Provider, res: WritableStreamDefaultWriter
// Returns: Promise<void>
export const validateImage = async (
  url: string,
  acceptHeader: string,
  cloudProvider: CloudProvider,
  sendData: (data: CacheValidationResponseData) => void,
) => {
  try {
    console.log(`Validating image: ${url}`);
    const id = crypto.randomUUID();
    const initialResponseData: CacheValidationResponseData = {
      time: new Date().toISOString(),
      id,
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
    const cache = response.headers.get(cloudProvider.cacheHeader);
    const cacheStatus =
      cache === cloudProvider.hit
        ? "HIT"
        : cache === cloudProvider.miss
          ? "MISS"
          : cache === cloudProvider.stale
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
        type: "IMG",
        responseStatus: response.status,
        contentType: contentType,
        contentTypeMismatch: contentType !== acceptHeader,
        acceptHeader,
        status: "DONE",
        cache: cacheStatus,
      },
      message:
        response.status >= 400
          ? response.statusText
          : cache === null
            ? "No Cache Header"
            : "",
    };
    sendData(responseData);
  } catch (e: unknown) {
    const error = e as Error;
    console.error("validateImage Error: ", error);
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
