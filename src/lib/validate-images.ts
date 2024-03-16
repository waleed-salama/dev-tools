import { backOff } from "exponential-backoff";
import { type CacheValidationResponseData } from "~/lib/api-types";
import { type CloudProvider } from "~/lib//cloudProviders";
import processHeaders from "~/lib/processHeaders";

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
  preferredProvider: CloudProvider | null,
  sendData: (data: CacheValidationResponseData) => void,
  streamOpen: boolean,
) => {
  if (streamOpen)
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
        await limit(
          validateImage,
          imgUrl,
          acceptHeader,
          preferredProvider,
          sendData,
          streamOpen,
        );
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
  preferredProvider: CloudProvider | null,
  sendData: (data: CacheValidationResponseData) => void,
  streamOpen: boolean,
) => {
  if (streamOpen)
    try {
      // console.debug(`Validating image: ${url}`);
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
          cacheResult: "",
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
              type: "IMG",
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
          type: "IMG",
          responseStatus: response.status,
          contentType: contentType,
          acceptHeader,
          cloudProviderName: cloudProvider?.name,
          status: "DONE",
          cacheResult,
          cacheStatus,
        },
        message: messages.join("\n"),
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
