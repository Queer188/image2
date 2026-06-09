import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
import {
  closeHistoryStoreForTests,
  saveHistoryRecord
} from "../src/history-store.js";
import { clearProvidersForTests } from "../src/provider-store.js";

beforeEach(() => {
  process.env.IMAGE2_DATA_DIR = mkdtempSync(join(tmpdir(), "image2-history-"));
});

afterEach(() => {
  clearProvidersForTests();
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

async function createSavedProvider(server: ReturnType<typeof buildServer>, baseUrl: string) {
  const response = await server.inject({
    method: "POST",
    url: "/api/providers",
    payload: {
      name: "History Provider",
      baseUrl,
      apiKey: "sk-history-secret"
    }
  });

  return response.json();
}

describe("history routes", () => {
  it("persists generation history after the server restarts", async () => {
    await withHttpServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          data: [
            {
              url: "https://cdn.example.com/persisted.png",
              width: 1024,
              height: 1024
            }
          ]
        })
      );
    }, async (baseUrl) => {
      const server = buildServer();
      const provider = await createSavedProvider(server, baseUrl);

      const generateResponse = await server.inject({
        method: "POST",
        url: "/api/images/generate",
        payload: {
          providerId: provider.id,
          modelId: "gpt-image-1",
          modelName: "GPT Image",
          mode: "text-to-image",
          prompt: "Persist this image",
          count: 1,
          seed: 12
        }
      });

      expect(generateResponse.statusCode).toBe(200);
      expect(generateResponse.json().historyRecord).toMatchObject({
        providerId: provider.id,
        providerName: "History Provider",
        modelId: "gpt-image-1",
        modelName: "GPT Image",
        parameters: {
          mode: "text-to-image",
          prompt: "Persist this image",
          seed: 12
        }
      });

      closeHistoryStoreForTests();
      const restartedServer = buildServer();
      const historyResponse = await restartedServer.inject({
        method: "GET",
        url: "/api/history"
      });

      expect(historyResponse.statusCode).toBe(200);
      expect(historyResponse.json()).toMatchObject({
        records: [
          {
            providerName: "History Provider",
            modelName: "GPT Image",
            parameters: {
              prompt: "Persist this image"
            },
            images: [
              {
                url: "https://cdn.example.com/persisted.png",
                width: 1024,
                height: 1024
              }
            ]
          }
        ]
      });
    });
  });

  it("deletes one history item and clears all history", async () => {
    const server = buildServer();
    const first = saveHistoryRecord({
      createdAt: "2026-06-09T00:00:01.000Z",
      providerId: "provider-1",
      providerName: "Provider 1",
      modelId: "model-1",
      modelName: "Model 1",
      mode: "text-to-image",
      prompt: "First",
      count: 1,
      images: [
        {
          id: "image-1",
          url: "https://cdn.example.com/first.png",
          metadata: {}
        }
      ]
    });
    saveHistoryRecord({
      createdAt: "2026-06-09T00:00:02.000Z",
      providerId: "provider-1",
      providerName: "Provider 1",
      modelId: "model-1",
      modelName: "Model 1",
      mode: "image-to-image",
      prompt: "Second",
      strength: 0.5,
      count: 1,
      images: [
        {
          id: "image-2",
          url: "https://cdn.example.com/second.png",
          metadata: {}
        }
      ]
    });

    const deleteResponse = await server.inject({
      method: "DELETE",
      url: `/api/history/${first.id}`
    });
    expect(deleteResponse.statusCode).toBe(204);

    const afterDelete = await server.inject({
      method: "GET",
      url: "/api/history"
    });
    expect(afterDelete.json().records).toHaveLength(1);
    expect(afterDelete.body).not.toContain("First");
    expect(afterDelete.body).toContain("Second");

    const clearResponse = await server.inject({
      method: "DELETE",
      url: "/api/history"
    });
    expect(clearResponse.statusCode).toBe(204);

    const afterClear = await server.inject({
      method: "GET",
      url: "/api/history"
    });
    expect(afterClear.json().records).toEqual([]);
  });

  it("does not include API keys in generation history responses", async () => {
    await withHttpServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          data: [
            {
              url: "https://cdn.example.com/no-secret.png"
            }
          ]
        })
      );
    }, async (baseUrl) => {
      const server = buildServer();
      const provider = await createSavedProvider(server, baseUrl);

      const generateResponse = await server.inject({
        method: "POST",
        url: "/api/images/generate",
        payload: {
          providerId: provider.id,
          modelId: "gpt-image-1",
          mode: "text-to-image",
          prompt: "No secret in history"
        }
      });
      expect(generateResponse.statusCode).toBe(200);
      expect(generateResponse.body).not.toContain("sk-history-secret");

      const historyResponse = await server.inject({
        method: "GET",
        url: "/api/history"
      });
      expect(historyResponse.statusCode).toBe(200);
      expect(historyResponse.body).not.toContain("sk-history-secret");
      expect(historyResponse.body).not.toContain("apiKey");
    });
  });

  it("imports browser history without preserving sensitive metadata", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/history/import",
      payload: {
        records: [
          {
            id: "browser-history-1",
            createdAt: "2026-06-09T00:00:00.000Z",
            providerId: "provider-1",
            providerName: "Browser Provider",
            modelId: "model-1",
            modelName: "Browser Model",
            parameters: {
              mode: "image-to-image",
              prompt: "Migrated prompt",
              inputImage: {
                fileName: "reference.png",
                mimeType: "image/png",
                sizeBytes: 5
              }
            },
            images: [
              {
                id: "image-1",
                url: "https://cdn.example.com/migrated.png",
                metadata: {
                  index: 0,
                  apiKey: "sk-import-secret",
                  dataUrl: "data:image/png;base64,aGVsbG8="
                }
              }
            ]
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("sk-import-secret");
    expect(response.body).not.toContain("data:image/png");
    expect(response.json()).toMatchObject({
      imported: 1,
      records: [
        {
          id: "browser-history-1",
          parameters: {
            mode: "image-to-image",
            prompt: "Migrated prompt"
          }
        }
      ]
    });
  });
});
