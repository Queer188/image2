import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
import { closeHistoryStoreForTests } from "../src/history-store.js";
import { clearUploadedImagesForTests } from "../src/image-upload-store.js";
import { clearProvidersForTests } from "../src/provider-store.js";
import { image2CompatibleAdapter } from "../src/providers/image2-compatible.js";
import { openAiCompatibleAdapter } from "../src/providers/openai-compatible.js";
import {
  generationFixtures,
  modelListFixtures
} from "./fixtures/provider-adapter-fixtures.js";

beforeEach(() => {
  process.env.IMAGE2_DATA_DIR = mkdtempSync(join(tmpdir(), "image2-adapter-"));
});

afterEach(() => {
  clearProvidersForTests();
  clearUploadedImagesForTests();
  closeHistoryStoreForTests({ removeDataDir: true });
  delete process.env.IMAGE2_DATA_DIR;
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

describe("provider adapter compatibility", () => {
  it.each(modelListFixtures)(
    "normalizes model list fixture: $name",
    async ({ payload, capabilityOverrides, expected }) => {
      await withHttpServer((request, response) => {
        expect(request.url).toBe("/v1/models");
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(payload));
      }, async (baseUrl) => {
        const models = await openAiCompatibleAdapter.listModels(
          {
            baseUrl,
            apiKey: "sk-fixture-secret",
            capabilityOverrides
          },
          "provider-fixture"
        );

        expect(models.map((model) => ({
          id: model.id,
          capabilities: model.capabilities
        }))).toEqual(expected);
      });
    }
  );

  it.each(generationFixtures)(
    "normalizes text-to-image fixture: $name",
    async ({ payload, expectedUrl }) => {
      await withHttpServer((request, response) => {
        expect(request.url).toBe("/v1/images/generations");
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(payload));
      }, async (baseUrl) => {
        const images = await openAiCompatibleAdapter.generateImage(
          {
            baseUrl,
            apiKey: "sk-fixture-secret"
          },
          {
            providerId: "provider-fixture",
            modelId: "gpt-image-1",
            mode: "text-to-image",
            prompt: "adapter fixture"
          }
        );

        expect(images[0]?.url).toBe(expectedUrl);
      });
    }
  );

  it("sends image2-compatible JSON aliases for image-to-image requests", async () => {
    await withHttpServer((request, response) => {
      expect(request.url).toBe("/v1/images/generations");

      let body = "";
      request.on("data", (chunk) => {
        body += chunk.toString();
      });
      request.on("end", () => {
        const payload = JSON.parse(body);
        expect(payload).toMatchObject({
          model: "image-edit-pro",
          mode: "image-to-image",
          image: "data:image/png;base64,aGVsbG8=",
          input_image: "data:image/png;base64,aGVsbG8=",
          reference_image: "data:image/png;base64,aGVsbG8=",
          mimeType: "image/png"
        });
        expect(payload.images).toEqual(["data:image/png;base64,aGVsbG8="]);
        expect(payload.input_images).toEqual(["data:image/png;base64,aGVsbG8="]);

        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            result: {
              images: [{ base64: "aGVsbG8=", mime_type: "image/jpeg" }]
            }
          })
        );
      });
    }, async (baseUrl) => {
      const images = await image2CompatibleAdapter.generateImage(
        {
          baseUrl,
          apiKey: "sk-fixture-secret"
        },
        {
          providerId: "provider-fixture",
          modelId: "image-edit-pro",
          mode: "image-to-image",
          prompt: "adapter fixture",
          strength: 0.5,
          inputImageId: "upload-1",
          inputImage: {
            id: "upload-1",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,aGVsbG8="
          }
        }
      );

      expect(images[0]?.url).toBe("data:image/jpeg;base64,aGVsbG8=");
    });
  });

  it("uses OpenAI-compatible multipart edits when provider type is selected", async () => {
    await withHttpServer((request, response) => {
      expect(request.url).toBe("/v1/images/edits");
      expect(request.headers["content-type"]).toContain("multipart/form-data");

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          data: [{ b64_json: "aGVsbG8=" }]
        })
      );
    }, async (baseUrl) => {
      const server = buildServer();
      const createResponse = await server.inject({
        method: "POST",
        url: "/api/providers",
        payload: {
          name: "OpenAI Provider",
          baseUrl,
          apiKey: "sk-route-secret",
          providerType: "openai-compatible"
        }
      });
      const provider = createResponse.json();

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
          prompt: "Edit through selected adapter",
          strength: 0.5,
          inputImageId: upload.image.id
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().images[0].url).toBe("data:image/png;base64,aGVsbG8=");
    });
  });
});
