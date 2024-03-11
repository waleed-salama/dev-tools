import crypto from "crypto";
import Head from "next/head";
import React from "react";
import CacheURLInput from "~/components/cache-validator/cache-url-input";
import CacheValidatorInstance, {
  type CacheValidatorInstanceProps,
} from "~/components/cache-validator/cache-validator-instance";

type Process = {
  key: string;
  props: CacheValidatorInstanceProps;
};

const CacheValidator = () => {
  const [processes, setProcesses] = React.useState<Process[]>([]);

  const processURL = (url: URL) => {
    const key = crypto.randomBytes(16).toString("hex");
    const props = { url };
    setProcesses((processes) => [{ key, props }, ...processes]);
  };

  return (
    <>
      <Head>
        <title>Cache Validator | waleed.dev</title>
        <meta
          name="description"
          content="A tool to recursively validate cache of a web application. Supports pages, and images with all srcsets."
        />
      </Head>
      <div className="flex flex-col gap-4 pb-8">
        <div className="bg-slate-300 py-8 dark:bg-slate-700">
          <h1 className="container text-5xl">Cache Validator</h1>
        </div>
        {/* <form
          className="container flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            console.log("submit");
            // send request with input value: /api/validate-cache-edge?i=4
            fetch(
              `/api/validate-cache-edge?i=${
                (
                  document.getElementById(
                    "iterations-input",
                  ) as HTMLInputElement
                ).value
              }`,
              {
                method: "GET",
              },
            )
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
                        return;
                      }
                      const decoder = new TextDecoder();
                      const decodedValue = decoder.decode(value);
                      console.log(decodedValue);
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
          }}
        >
          <input
            className="rounded p-2"
            id="iterations-input"
            name="i"
            type="text"
            placeholder="iterations"
          />
          <button className="rounded bg-emerald-500 p-2 text-white">
            Process
          </button>
        </form> */}
        <div className="container flex flex-col gap-4">
          <CacheURLInput onSubmit={processURL} />
          {processes.map((process) => (
            <CacheValidatorInstance key={process.key} {...process.props} />
          ))}
        </div>
      </div>
    </>
  );
};

export default CacheValidator;
