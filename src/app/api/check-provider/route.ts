import cloudProviders from "~/lib/cloudProviders";

// To use edge runtime on Vercel
export const runtime = "edge";
// export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url).searchParams.get("url");
    if (!url) {
      return new Response("No URL provided", { status: 200 });
    }
    const response = await fetch(url, {
      method: "HEAD",
    });
    if (response.ok) {
      for (const provider of cloudProviders) {
        if (response.headers.has(provider.cacheHeader)) {
          return new Response(provider.name, { status: 200 });
        }
      }
      return new Response("No cache header found", { status: 200 });
    } else return new Response("No cache header found", { status: 200 });
  } catch (error) {
    console.error("Error: ", error);
    return new Response("Error", { status: 200 });
  }
  //   return new Response("No cache header found", { status: 404 });
}
