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
        <title>Cache Validator</title>
        <meta
          name="description"
          content="A tool to recursively validate cache of a web application. Supports pages, and images with all srcsets."
        />
      </Head>
      <div className="flex flex-col gap-4 pb-8">
        <div className="bg-slate-300 py-8 dark:bg-slate-700">
          <h1 className="container text-5xl">Cache Validator</h1>
        </div>
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
