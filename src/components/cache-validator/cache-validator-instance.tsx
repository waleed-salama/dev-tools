import React from "react";
import {
  type CacheValidationRequestBody,
  cacheValidationResponseDataSchema,
  type CacheValidationResponseData,
} from "~/lib/api-types";
import Spinner from "../ui/spinner";
import { Toggle } from "~/components/ui/toggle";
import { CheckCircle, CheckIcon } from "lucide-react";
import { type CloudProvider } from "~/lib/cloudProviders";

export type CacheValidatorInstanceProps = {
  url: URL;
  formats: string[];
  preferredProvider: CloudProvider | null;
};

// Reducer: responsesReducer
// Holds and manages the responses state with dispatch to add responses or update existing ones
// sort the responses by time descending
const responsesReducer = (
  state: CacheValidationResponseData[],
  action: CacheValidationResponseData,
) => {
  const existingIndex = state.findIndex((r) => r.id === action.id);
  if (existingIndex !== -1) {
    return state.map((item, i) =>
      i === existingIndex ? { ...action, time: item.time } : item,
    );
  }
  return [...state, action].sort((a, b) => {
    if (a.time < b.time) {
      return -1;
    }
    if (a.time > b.time) {
      return 1;
    }
    return 0;
  });
};

// Reducer: logSettingsReducer
// Holds and manages the log settings state with dispatch to toggle the active state of a log level
type LogSettings = { level: string; active: boolean }[];
const logSettingsReducer = (state: LogSettings, action: string) => {
  const index = state.findIndex((l) => l.level === action);
  if (index !== -1) {
    return state.map((item, i) =>
      i === index ? { ...item, active: !item.active } : item,
    );
  } else {
    console.warn(
      "Log level not found to toggle: ",
      action,
      ". Adding it to the log settings.",
    );
    return [...state, { level: action, active: true }];
  }
};

// Component: CacheValidatorInstance
// Description: The main component for the cache validator instance. It fetches the cache validation data from the API and displays it.
// Parameters: { url }: CacheValidatorInstanceProps
const CacheValidatorInstance = ({
  url,
  formats,
  preferredProvider,
}: CacheValidatorInstanceProps) => {
  const [responses, dispatch] = React.useReducer(responsesReducer, []);
  const [done, setDone] = React.useState(false);

  // State to keep the time elapsed
  const [timeElapsed, setTimeElapsed] = React.useState(0);
  React.useEffect(() => {
    const interval = setInterval(() => {
      if (!done) setTimeElapsed((timeElapsed) => timeElapsed + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [done]);

  // State to keep track of pages and images visited and validated
  const stats = React.useMemo(() => {
    const pagesFound = responses.filter(
      (response) => response.head?.type === "PAGE",
    ).length;
    const imagesFound = responses.filter(
      (response) => response.head?.type === "IMG",
    ).length;
    const pagesVisited = responses.filter(
      (response) =>
        response.head?.type === "PAGE" && response.head?.status === "DONE",
    ).length;
    const imagesVisited = responses.filter(
      (response) =>
        response.head?.type === "IMG" && response.head?.status === "DONE",
    ).length;
    const pagesCached = responses.filter(
      (response) =>
        response.head?.type === "PAGE" &&
        response.head?.cacheResult === "CACHED",
    ).length;
    const imagesCached = responses.filter(
      (response) =>
        response.head?.type === "IMG" &&
        response.head?.cacheResult === "CACHED",
    ).length;
    const pagesUncached = responses.filter(
      (response) =>
        response.head?.type === "PAGE" &&
        response.head?.cacheResult === "UNCACHED",
    ).length;
    const imagesUncached = responses.filter(
      (response) =>
        response.head?.type === "IMG" &&
        response.head?.cacheResult === "UNCACHED",
    ).length;
    const pagesOther = responses.filter(
      (response) =>
        response.head?.type === "PAGE" &&
        response.head?.cacheResult === "OTHER",
    ).length;
    const imagesOther = responses.filter(
      (response) =>
        response.head?.type === "IMG" && response.head?.cacheResult === "OTHER",
    ).length;
    const pagesError = responses.filter(
      (response) =>
        response.head?.type === "PAGE" &&
        response.head?.cacheResult === "ERROR",
    ).length;
    const imagesError = responses.filter(
      (response) =>
        response.head?.type === "IMG" && response.head?.cacheResult === "ERROR",
    ).length;
    return {
      pagesFound,
      imagesFound,
      pagesVisited,
      imagesVisited,
      pagesCached,
      imagesCached,
      pagesUncached,
      imagesUncached,
      pagesOther,
      imagesOther,
      pagesError,
      imagesError,
    };
  }, [responses]);

  const [logSettings, toggelLogSetting] = React.useReducer(logSettingsReducer, [
    { level: "VERBOSE", active: false },
    { level: "INFO", active: true },
    { level: "SUCCESS", active: true },
    { level: "WARNING", active: true },
    { level: "ERROR", active: true },
  ]);

  const filteredResponses = React.useMemo(
    () =>
      responses.filter((response) =>
        logSettings.find(
          (setting) => setting.level === response.level && setting.active,
        ),
      ),
    [responses, logSettings],
  );

  // Function: pushResponse
  // Description: Pushes a response to the responses reducer to update the state.
  const pushResponse = React.useCallback(
    (response: CacheValidationResponseData) => {
      dispatch(response);
      // updatesQueue.current.push(response);
    },
    [],
  );

  // Hook: useEffect to fetch the cache validation data on mount
  React.useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      const parameters: CacheValidationRequestBody = {
        url: url.href,
        formats,
        preferredProvider: preferredProvider,
      };
      const options = {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parameters),
      };

      let incompleteData = "";

      await fetch("/api/validate-cache", options)
        .then(async (response) => {
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("No reader");
          }
          const read = async () => {
            await reader
              .read()
              .then(async ({ done, value }) => {
                if (done) {
                  console.info("Stream complete");
                  setDone(true);
                  return;
                }
                const decoder = new TextDecoder();
                const decodedValue = decoder.decode(value);
                console.log(decodedValue);
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
                      pushResponse(data);
                    } catch (error) {
                      incompleteData += json;
                    }
                  });
                } else {
                  try {
                    const data = cacheValidationResponseDataSchema.parse(
                      JSON.parse(text),
                    );
                    //   console.log(data);
                    pushResponse(data);
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
        })
        .catch((error) => {
          console.error(error);
        });
    };
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    load();
    return () => {
      controller.abort();
    };
  }, [url, formats, preferredProvider, pushResponse]);

  return (
    <div className="overflow-hidden rounded bg-slate-200 text-xs dark:bg-slate-600 max-2xl:w-full 2xl:w-[1000px]">
      <div
        className={`flex w-full flex-col gap-4 p-2 transition-all duration-500 sm:p-4 ${done ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}
      >
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div
              className={`flex items-center gap-2 break-words transition-colors duration-500 sm:text-base ${done ? "text-slate-800" : ""}`}
            >
              {done ? (
                <CheckCircle className="h-6 w-6" />
              ) : (
                <Spinner className="h-6 w-6" />
              )}
              <span className="font-bold">URL:</span> {url.href}
            </div>
            <div
              className={`flex gap-2 font-bold transition-colors duration-500 lg:hidden ${done ? "text-slate-800" : ""}`}
            >
              {timeElapsed}s
            </div>
          </div>
          <div className="flex w-full items-center justify-center gap-2 sm:gap-4">
            <div className="flex grow flex-col gap-2 overflow-hidden rounded bg-slate-200 pb-2 text-center dark:bg-slate-800 max-md:text-start">
              <div className="bg-slate-400 p-2 font-bold dark:bg-slate-600 sm:px-4">
                Pages
              </div>
              <div className="flex gap-4 px-2 max-md:flex-col max-md:gap-1 sm:px-4 md:justify-center">
                <div>
                  <strong>Found</strong> {stats.pagesFound}
                </div>
                <div>
                  <strong>Visited</strong> {stats.pagesVisited}
                </div>
                <div />
                <div>
                  <strong>Cached</strong> {stats.pagesCached}
                </div>
                <div>
                  <strong>Uncached</strong> {stats.pagesUncached}
                </div>
                <div>
                  <strong>Other</strong> {stats.pagesOther}
                </div>
                <div>
                  <strong>Error</strong> {stats.pagesError}
                </div>
              </div>
            </div>
            <div className="flex grow flex-col gap-2 overflow-hidden rounded bg-slate-200 pb-2 text-center dark:bg-slate-800 max-md:text-start">
              <div className="bg-slate-400 p-2 font-bold dark:bg-slate-600 sm:px-4">
                Images
              </div>
              <div className="flex gap-4 px-2 max-md:flex-col max-md:gap-1 sm:px-4 md:justify-center">
                <div>
                  <strong>Found</strong> {stats.imagesFound}
                </div>
                <div>
                  <strong>Visited</strong> {stats.imagesVisited}
                </div>
                <div />
                <div>
                  <strong>Cached</strong> {stats.imagesCached}
                </div>
                <div>
                  <strong>Uncached</strong> {stats.imagesUncached}
                </div>
                <div>
                  <strong>Other</strong> {stats.imagesOther}
                </div>
                <div>
                  <strong>Error</strong> {stats.imagesError}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 overflow-hidden rounded bg-slate-200 pb-2 text-center dark:bg-slate-800 max-lg:hidden">
              <div className="bg-slate-400 px-4 py-2 font-bold dark:bg-slate-600">
                Time Elapsed
              </div>
              <div>{timeElapsed}s</div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-1 bg-slate-300 p-2 dark:bg-slate-500 max-sm:flex-wrap max-sm:justify-center sm:px-4">
        {logSettings.map((logSetting, index) => (
          <Toggle
            value={logSetting.level}
            key={index}
            variant={"outline"}
            size="sm"
            className="px-2 text-xs"
            pressed={logSetting.active}
            onPressedChange={() => toggelLogSetting(logSetting.level)}
          >
            {logSetting.level}
          </Toggle>
        ))}
      </div>
      <div className="flex max-h-96 min-h-20 w-full flex-col gap-1 overflow-y-scroll p-2 sm:p-4">
        {filteredResponses.map((response, index) => (
          <div
            key={index}
            className={`grid w-full grid-cols-[20px_40px_70px_30px_calc(100%_-_160px)] ${response.level === "INFO" ? "text-sky-600 dark:text-sky-400" : ""} ${response.level === "SUCCESS" ? "text-emerald-600 dark:text-emerald-400" : ""} ${response.level === "WARNING" ? "text-amber-600 dark:text-amber-400" : ""} ${response.level === "ERROR" ? "text-red-600 dark:text-red-400" : ""}`}
          >
            <div>
              {response.head?.status === "PENDING" ? (
                <Spinner className="h-4 w-4" />
              ) : response.head?.status === "DONE" ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                "  "
              )}
            </div>
            {response.type === "message" && (
              <div className="col-span-4">{response.message}</div>
            )}
            {response.type === "head" && (
              <>
                <div>{response.head?.type}</div>
                <div>{response.head?.cacheResult}</div>
                <div>
                  {response.head?.responseStatus &&
                    response.head?.responseStatus}
                </div>
                <div className="break-words">
                  {response.head?.contentType && (
                    <span className="mr-1 h-4 text-nowrap rounded bg-slate-300 px-1 text-[0.65rem] dark:bg-slate-500">
                      {response.head?.contentType.split(";")[0] !==
                        response.head?.acceptHeader && (
                        <span className="mr-1 line-through decoration-red-500/80">
                          {response.head?.acceptHeader}
                        </span>
                      )}
                      {response.head?.contentType.split(";")[0]}
                    </span>
                  )}
                  {/* <span className="inline break-words"> */}
                  {response.head?.url}
                  {response.message
                    ? response.message.split("\n").map((message, i) => (
                        <div key={i} className="ml-2 border-l border-current">
                          ▶︎&nbsp;{message}
                        </div>
                      ))
                    : ""}
                  {/* </span> */}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CacheValidatorInstance;
