import React from "react";
import {
  type CacheValidationRequestBody,
  cacheValidationResponseDataSchema,
  type CacheValidationResponseData,
} from "~/lib/api-types";

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
    return state.map((item, i) => (i === existingIndex ? action : item));
  }
  return [...state, action].sort((a, b) => {
    if (a.time > b.time) {
      return -1;
    }
    if (a.time < b.time) {
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

  // Hook: useMemo to fetch the cache validation data on mount
  React.useMemo(() => {
    const parameters: CacheValidationRequestBody = { url: url.href };
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parameters),
    };

    let incompleteData = "";

    fetch("/api/validate-cache-edge", options)
      .then((response) => {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No reader");
        }
        const read = () => {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                console.info("Stream complete");
                setDone(true);
                return;
              }
              const decoder = new TextDecoder();
              const text = incompleteData + decoder.decode(value);
              incompleteData = "";
              console.log(text);
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
                    incompleteData += s;
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
              // if (incompleteData.length > 0) {
              //   const split = incompleteData.split("}{");
              //   if (split.length > 1) {
              //     split.forEach((s, index) => {
              //       const json =
              //         index === 0
              //           ? `${s}}`
              //           : index === split.length - 1
              //             ? `{${s}`
              //             : `{${s}}`;
              //       try {
              //         const data = cacheValidationResponseDataSchema.parse(
              //           JSON.parse(json),
              //         );
              //         pushResponse(data);
              //         incompleteData.replace(s, "");
              //       } catch (error) {
              //         // still incomplete
              //       }
              //     });
              //   }
              // }
              read();
            })
            .catch((error) => {
              console.error(error);
            });
        };
        read();
      })
      .catch((error) => {
        console.error(error);
      });
  }, [url, pushResponse]);

  return (
    <div className="w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-600">
      <div className="bg-slate-300 p-4 text-xs dark:bg-slate-700">
        {/* Settings... */}
      </div>
      <div
        key={done ? "A" : "B"}
        className="flex max-h-96 w-full flex-col gap-1 overflow-y-scroll p-4 text-xs"
      >
        {done && (
          <div className="text-emerald-600 dark:text-emerald-400">
            ✅ Done processing URLs
          </div>
        )}
        {responses.map((response, index) => (
          <div
            key={index}
            className={`grid grid-cols-[20px_40px_40px_auto] ${response.level === "INFO" ? "text-sky-600 dark:text-sky-400" : ""} ${response.level === "SUCCESS" ? "text-emerald-600 dark:text-emerald-400" : ""} ${response.level === "WARNING" ? "text-amber-600 dark:text-amber-400" : ""} ${response.level === "ERROR" ? "text-red-600 dark:text-red-400" : ""}`}
          >
            <div>
              {response.head?.status === "PENDING"
                ? "⏳"
                : response.head?.status === "DONE"
                  ? "✅"
                  : "  "}
            </div>
            {response.type === "message" && (
              <div className="col-span-3">{response.message}</div>
            )}
            {response.type === "head" && (
              <>
                <div>{response.head?.type}</div>
                <div>{response.head?.cache}</div>
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
