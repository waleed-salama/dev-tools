import Head from "next/head";
import Link from "next/link";
import { Button } from "~/components/ui/button";

// import { api } from "~/utils/api";

export default function Home() {
  // const hello = api.post.hello.useQuery({ text: "from tRPC" });

  return (
    <>
      <Head>
        <title>dev-tools | waleed.dev</title>
        <meta
          name="description"
          content="A set of dev tools to automate development tasks."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="flex flex-col items-center justify-center">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16 ">
          <h1 className="text-center">
            Validate your web app&apos;s cache{" "}
            <span className="text-orange-600 dark:text-orange-400">
              instantly!
            </span>
          </h1>
          <Button asChild variant="default" size="lg">
            <Link href="/cache-validator">Get Started</Link>
          </Button>
        </div>
      </main>
    </>
  );
}
