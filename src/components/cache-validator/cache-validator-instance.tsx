import React from "react";
import {
  type CacheValidationRequestBody,
  cacheValidationResponseDataSchema,
  type CacheValidationResponseData,
} from "~/lib/api-types";
import Spinner from "../ui/spinner";

export type CacheValidatorInstanceProps = {
  url: URL;
};

// Reducer: responsesReducer
// Holds and manages the responses state with dispatch to add responses or update existing ones
// sort the responses by time descending
const responsesReducer = (
  state: CacheValidationResponseData[],
  action: CacheValidationResponseData,
) => {
  const existingIndex = state.findIndex(
    (r) => r.head?.url === action.head?.url,
  );
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
const CacheValidatorInstance = ({ url }: CacheValidatorInstanceProps) => {
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
    const pagesHit = responses.filter(
      (response) =>
        response.head?.type === "PAGE" && response.head?.cache === "HIT",
    ).length;
    const imagesHit = responses.filter(
      (response) =>
        response.head?.type === "IMG" && response.head?.cache === "HIT",
    ).length;
    const pagesMiss = responses.filter(
      (response) =>
        response.head?.type === "PAGE" && response.head?.cache === "MISS",
    ).length;
    const imagesMiss = responses.filter(
      (response) =>
        response.head?.type === "IMG" && response.head?.cache === "MISS",
    ).length;
    const pagesStale = responses.filter(
      (response) =>
        response.head?.type === "PAGE" && response.head?.cache === "STALE",
    ).length;
    const imagesStale = responses.filter(
      (response) =>
        response.head?.type === "IMG" && response.head?.cache === "STALE",
    ).length;
    const pagesError = responses.filter(
      (response) =>
        response.head?.type === "PAGE" && response.head?.status === "ERROR",
    ).length;
    const imagesError = responses.filter(
      (response) =>
        response.head?.type === "IMG" && response.head?.status === "ERROR",
    ).length;
    return {
      pagesFound,
      imagesFound,
      pagesVisited,
      imagesVisited,
      pagesHit,
      imagesHit,
      pagesMiss,
      imagesMiss,
      pagesStale,
      imagesStale,
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

  // const updatesQueue = React.useRef<CacheValidationResponseData[]>([]);

  // Hook: useEffect to process the updates queue
  // React.useEffect(() => {
  //   const interval = setInterval(() => {
  //     if (updatesQueue.current.length > 0) {
  //       dispatch(updatesQueue.current.shift()!);
  //     }
  //   }, 10);
  //   return () => clearInterval(interval);
  // }, []);

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
    let active = true;

    const load = async () => {
      const parameters: CacheValidationRequestBody = { url: url.href };
      const options = {
        method: "POST",
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
    if (active) load();
    return () => {
      active = false;
    };
  }, [url, pushResponse]);

  return (
    <div className="w-full overflow-hidden rounded bg-slate-200 text-xs dark:bg-slate-600">
      <div
        className={`flex flex-col gap-4 p-4 transition-all duration-500 ${done ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}
      >
        {/* Settings...
        {done && (
          <div className="font-extrabold text-emerald-600 dark:text-emerald-400">
            ✅ Done processing URLs
          </div>
        )} */}
        <div>
          <div className="flex items-center justify-center gap-4">
            <div className="flex flex-col gap-2 overflow-hidden rounded bg-slate-200 pb-2 text-center dark:bg-slate-800">
              <div className="bg-slate-400 py-2 font-bold dark:bg-slate-600">
                Pages
              </div>
              <div className="flex gap-4 px-4">
                <div>Found: {stats.pagesFound}</div>
                <div>Visited: {stats.pagesVisited}</div>
                <div>HIT: {stats.pagesHit}</div>
                <div>MISS: {stats.pagesMiss}</div>
                <div>STALE: {stats.pagesStale}</div>
                <div>ERROR: {stats.pagesError}</div>
              </div>
            </div>
            <div className="flex flex-col gap-2 overflow-hidden rounded bg-slate-200 pb-2 text-center dark:bg-slate-800">
              <div className="bg-slate-400 py-2 font-bold dark:bg-slate-600">
                Images
              </div>
              <div className="flex gap-4 px-4">
                <div>Found: {stats.imagesFound}</div>
                <div>Visited: {stats.imagesVisited}</div>
                <div>HIT: {stats.imagesHit}</div>
                <div>MISS: {stats.imagesMiss}</div>
                <div>STALE: {stats.imagesStale}</div>
                <div>ERROR: {stats.imagesError}</div>
              </div>
            </div>
            <div className="flex flex-col gap-2 overflow-hidden rounded bg-slate-200 pb-2 text-center dark:bg-slate-800">
              <div className="bg-slate-400 px-4 py-2 font-bold dark:bg-slate-600">
                Time Elapsed
              </div>

              <div>{timeElapsed}s</div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex max-h-96 w-full flex-col gap-1 overflow-y-scroll p-4">
        {responses.map((response, index) => (
          <div
            key={index}
            className={`grid grid-cols-[20px_40px_40px_30px_auto] ${response.level === "INFO" ? "text-sky-600 dark:text-sky-400" : ""} ${response.level === "SUCCESS" ? "text-emerald-600 dark:text-emerald-400" : ""} ${response.level === "WARNING" ? "text-amber-600 dark:text-amber-400" : ""} ${response.level === "ERROR" ? "text-red-600 dark:text-red-400" : ""}`}
          >
            <div>
              {response.head?.status === "PENDING" ? (
                <Spinner className="h-4 w-4" />
              ) : response.head?.status === "DONE" ? (
                "✅"
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
                <div>{response.head?.cache}</div>
                <div>
                  {response.head?.responseStatus &&
                    response.head?.responseStatus}
                </div>
                <div>{response.head?.url}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CacheValidatorInstance;
