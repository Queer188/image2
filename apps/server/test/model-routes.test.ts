import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
import { clearProvidersForTests } from "../src/provider-store.js";

afterEach(() => {
  clearProvidersForTests();
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

describe("model routes", () => {
  it("lists image models for a saved provider without returning the API key", async () => {
    const apiKey = "sk-model-secret";

    await withHttpServer((request, response) => {
      expect(request.url).toBe("/v1/models");
      response.setHeader("content-type", "application/json");
      response.statusCode =
        request.headers.authorization === `Bearer ${apiKey}` ? 200 : 401;
      response.end(
        JSON.stringify({
          data: [
            { id: "gpt-image-1", name: "GPT Image", capabilities: ["text-to-image"] },
            { id: "image-edit-pro", capabilities: ["image-to-image"] },
            { id: "gpt-4.1", object: "model" }
          ]
        })
      );
    }, async (baseUrl) => {
      const server = buildServer();
      const createResponse = await server.inject({
        method: "POST",
        url: "/api/providers",
        payload: {
          name: "Model Provider",
          baseUrl,
          apiKey
        }
      });
      const provider = createResponse.json();

      const listResponse = await server.inject({
        method: "POST",
        url: "/api/models/list",
        payload: {
          providerId: provider.id
        }
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.body).not.toContain(apiKey);
      expect(listResponse.json()).toMatchObject({
        models: [
          {
            id: "gpt-image-1",
            name: "GPT Image",
            providerId: provider.id,
            capabilities: ["text-to-image"]
          },
          {
            id: "image-edit-pro",
            name: "image-edit-pro",
            providerId: provider.id,
            capabilities: ["image-to-image"]
          }
        ]
      });
    });
  });

  it("returns a sanitized model list auth error", async () => {
    const apiKey = "sk-invalid-model-secret";

    await withHttpServer((_request, response) => {
      response.statusCode = 401;
      response.end(`invalid key ${apiKey}`);
    }, async (baseUrl) => {
      const server = buildServer();
      const createResponse = await server.inject({
        method: "POST",
        url: "/api/providers",
        payload: {
          name: "Bad Provider",
          baseUrl,
          apiKey
        }
      });
      const provider = createResponse.json();

      const listResponse = await server.inject({
        method: "POST",
        url: "/api/models/list",
        payload: {
          providerId: provider.id
        }
      });

      expect(listResponse.statusCode).toBe(401);
      expect(listResponse.body).not.toContain(apiKey);
      expect(listResponse.json()).toEqual({
        error: {
          code: "PROVIDER_AUTH_FAILED",
          message: "Provider rejected the API Key.",
          detail: "Provider returned HTTP 401."
        }
      });
    });
  });

  it("redacts provider model-list error details", async () => {
    const apiKey = "sk-model-detail-secret";

    await withHttpServer((_request, response) => {
      response.statusCode = 500;
      response.end(
        JSON.stringify({
          error: `Authorization: Bearer ${apiKey}`,
          apiKey,
          token: apiKey
        })
      );
    }, async (baseUrl) => {
      const server = buildServer();
      const createResponse = await server.inject({
        method: "POST",
        url: "/api/providers",
        payload: {
          name: "Leaky Provider",
          baseUrl,
          apiKey
        }
      });
      const provider = createResponse.json();

      const listResponse = await server.inject({
        method: "POST",
        url: "/api/models/list",
        payload: {
          providerId: provider.id
        }
      });

      expect(listResponse.statusCode).toBe(502);
      expect(listResponse.body).not.toContain(apiKey);
      expect(listResponse.body).not.toContain("Bearer sk-");
      expect(listResponse.json()).toMatchObject({
        error: {
          code: "PROVIDER_MODEL_LIST_FAILED"
        }
      });
    });
  });
});
