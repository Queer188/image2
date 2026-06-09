import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
import { clearUploadedImagesForTests } from "../src/image-upload-store.js";
import { clearProvidersForTests } from "../src/provider-store.js";

afterEach(() => {
  clearProvidersForTests();
  clearUploadedImagesForTests();
});

async function withHttpServer(
  handler: Parameters<typeof createServer>[0],
  run: (baseUrl: string) => Promise<void>
) {
  const provider = createServer(handler);

  await new Promise<void>((resolve) => {
    provider.listen(0, "127.0.0.1", resolve);
  });

  const address = provider.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}/v1`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      provider.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

async function createSavedProvider(server: ReturnType<typeof buildServer>, baseUrl: string) {
  const response = await server.inject({
    method: "POST",
    url: "/api/providers",
    payload: {
      name: "Generation Provider",
      baseUrl,
      apiKey: "sk-generation-secret"
    }
  });

  return response.json();
}

describe("image routes", () => {
  it("generates text-to-image results for a saved provider without returning the API key", async () => {
    await withHttpServer((request, response) => {
      expect(request.url).toBe("/v1/images/generations");
      expect(request.headers.authorization).toBe("Bearer sk-generation-secret");

      let body = "";
      request.on("data", (chunk) => {
        body += chunk.toString();
      });
      request.on("end", () => {
        expect(JSON.parse(body)).toMatchObject({
          model: "gpt-image-1",
          prompt: "A quiet studio desk",
          negative_prompt: "blur",
          n: 2,
          size: "1024x1024",
          quality: "hd",
          seed: 42
        });

        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            data: [
              {
                url: "https://cdn.example.com/image-1.png",
                width: 1024,
                height: 1024,
                seed: 42,
                revised_prompt: "A quiet studio desk with warm light"
              }
            ]
          })
        );
      });
    }, async (baseUrl) => {
      const server = buildServer();
      const provider = await createSavedProvider(server, baseUrl);

      const response = await server.inject({
        method: "POST",
        url: "/api/images/generate",
        payload: {
          providerId: provider.id,
          modelId: "gpt-image-1",
          mode: "text-to-image",
          prompt: "A quiet studio desk",
          negativePrompt: "blur",
          ratio: "1:1",
          quality: "hd",
          count: 2,
          seed: 42
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain("sk-generation-secret");
      expect(response.json()).toMatchObject({
        images: [
          {
            url: "https://cdn.example.com/image-1.png",
            width: 1024,
            height: 1024,
            seed: 42,
            metadata: {
              index: 0,
              revisedPrompt: "A quiet studio desk with warm light"
            }
          }
        ]
      });
    });
  });

  it("uploads a reference image without returning image data", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/images/upload",
      payload: {
        fileName: "reference.png",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,aGVsbG8="
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain("aGVsbG8=");
    expect(response.json()).toMatchObject({
      image: {
        fileName: "reference.png",
        mimeType: "image/png",
        sizeBytes: 5
      }
    });
  });

  it("rejects unsupported reference image uploads with a clear error", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/images/upload",
      payload: {
        fileName: "reference.gif",
        mimeType: "image/gif",
        dataUrl: "data:image/gif;base64,aGVsbG8="
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "Only PNG, JPEG, and WebP uploads are supported."
      }
    });
  });

  it("generates image-to-image results with image2-compatible JSON payloads", async () => {
    await withHttpServer((request, response) => {
      expect(request.url).toBe("/v1/images/generations");
      expect(request.headers.authorization).toBe("Bearer sk-generation-secret");

      let body = "";
      request.on("data", (chunk) => {
        body += chunk.toString();
      });
      request.on("end", () => {
        expect(body).not.toContain("sk-generation-secret");
        expect(JSON.parse(body)).toMatchObject({
          model: "image-edit-pro",
          mode: "image-to-image",
          prompt: "Keep the layout, change the material",
          negative_prompt: "blur",
          ratio: "4:3",
          quality: "standard",
          n: 1,
          seed: 7,
          strength: 0.65,
          image: "data:image/png;base64,aGVsbG8="
        });

        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            images: [
              {
                url: "https://cdn.example.com/edited.png",
                width: 1024,
                height: 768
              }
            ]
          })
        );
      });
    }, async (baseUrl) => {
      const server = buildServer();
      const provider = await createSavedProvider(server, baseUrl);
      const uploadResponse = await server.inject({
        method: "POST",
        url: "/api/images/upload",
        payload: {
          fileName: "reference.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,aGVsbG8="
        }
      });
      const upload = uploadResponse.json();

      const response = await server.inject({
        method: "POST",
        url: "/api/images/generate",
        payload: {
          providerId: provider.id,
          modelId: "image-edit-pro",
          mode: "image-to-image",
          prompt: "Keep the layout, change the material",
          negativePrompt: "blur",
          ratio: "4:3",
          quality: "standard",
          count: 1,
          seed: 7,
          strength: 0.65,
          inputImageId: upload.image.id
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain("sk-generation-secret");
      expect(response.body).not.toContain("aGVsbG8=");
      expect(response.json()).toMatchObject({
        images: [
          {
            url: "https://cdn.example.com/edited.png",
            width: 1024,
            height: 768
          }
        ]
      });
    });
  });

  it("falls back to OpenAI-compatible image edit payloads when JSON edits are unavailable", async () => {
    await withHttpServer((request, response) => {
      if (request.url === "/v1/images/generations") {
        response.statusCode = 404;
        response.end("not found");
        return;
      }

      expect(request.url).toBe("/v1/images/edits");
      expect(request.headers.authorization).toBe("Bearer sk-generation-secret");
      expect(request.headers["content-type"]).toContain("multipart/form-data");

      let body = "";
      request.on("data", (chunk) => {
        body += chunk.toString();
      });
      request.on("end", () => {
        expect(body).toContain("image-edit-pro");
        expect(body).toContain("Edit this image");
        expect(body).toContain("strength");
        expect(body).not.toContain("sk-generation-secret");

        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            data: [
              {
                b64_json: "aGVsbG8="
              }
            ]
          })
        );
      });
    }, async (baseUrl) => {
      const server = buildServer();
      const provider = await createSavedProvider(server, baseUrl);
      const uploadResponse = await server.inject({
        method: "POST",
        url: "/api/images/upload",
        payload: {
          fileName: "reference.webp",
          mimeType: "image/webp",
          dataUrl: "data:image/webp;base64,aGVsbG8="
        }
      });
      const upload = uploadResponse.json();

      const response = await server.inject({
        method: "POST",
        url: "/api/images/generate",
        payload: {
          providerId: provider.id,
          modelId: "image-edit-pro",
          mode: "image-to-image",
          prompt: "Edit this image",
          count: 1,
          strength: 0.5,
          inputImageId: upload.image.id
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain("sk-generation-secret");
      expect(response.json().images[0].url).toBe("data:image/png;base64,aGVsbG8=");
    });
  });

  it("returns sanitized generation auth errors", async () => {
    await withHttpServer((_request, response) => {
      response.statusCode = 401;
      response.end("nope sk-generation-secret");
    }, async (baseUrl) => {
      const server = buildServer();
      const provider = await createSavedProvider(server, baseUrl);

      const response = await server.inject({
        method: "POST",
        url: "/api/images/generate",
        payload: {
          providerId: provider.id,
          modelId: "gpt-image-1",
          mode: "text-to-image",
          prompt: "A quiet studio desk"
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.body).not.toContain("sk-generation-secret");
      expect(response.json()).toEqual({
        error: {
          code: "PROVIDER_AUTH_FAILED",
          message: "Provider rejected the API Key.",
          detail: "Provider returned HTTP 401."
        }
      });
    });
  });
});

