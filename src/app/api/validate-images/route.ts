import {
  type CacheValidationResponseData,
  imageSubsetValidationRequestSchema,
} from "~/lib/api-types";
import { validateImages } from "~/lib/validate-images";

export async function POST(req: Request) {
  try {
    const { imgUrls, acceptHeader, cloudProvider } =
      imageSubsetValidationRequestSchema.parse(await req.json());

    const stream = new ReadableStream({
      async start(controller) {
        const sendData = (data: CacheValidationResponseData) => {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(data)));
        };
        await validateImages(imgUrls, acceptHeader, cloudProvider, sendData);
        sendData({
          time: new Date().toISOString(),
          id: crypto.randomUUID(),
          level: "INFO",
          type: "message",
          message: "Image subset validation complete",
        });
        controller.close();
      },

      async cancel() {
        console.log("Stream canceled");
      },
    });

    return new Response(stream);
  } catch (e: unknown) {
    const error = e as Error;
    console.error("POST /api/validate-images Error: ", error);
    return new Response(error.message, { status: 500 });
  }
}
