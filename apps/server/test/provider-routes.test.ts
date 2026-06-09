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
    await run(`http://127.0.0.1:${address.port}`);
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

describe("provider routes", () => {
  it("creates, lists, updates, and deletes providers without returning API keys", async () => {
    const server = buildServer();
    const apiKey = "sk-test-secret-value";

    const createResponse = await server.inject({
      method: "POST",
      url: "/api/providers",
        payload: {
          name: "Local Provider",
          baseUrl: "https://127.0.0.1/v1",
          apiKey
        }
      });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.body).not.toContain(apiKey);

    const provider = createResponse.json();
    expect(provider).toMatchObject({
      name: "Local Provider",
      baseUrl: "https://127.0.0.1/v1",
      lastTestStatus: "untested"
    });
    expect(provider.apiKeyRef).toEqual(expect.any(String));
    expect(provider.apiKeyPreview).toBe("sk-...alue");
    expect(provider.apiKey).toBeUndefined();

    const updateResponse = await server.inject({
      method: "PUT",
      url: `/api/providers/${provider.id}`,
      payload: {
        name: "Updated Provider"
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().name).toBe("Updated Provider");

    const listResponse = await server.inject({
      method: "GET",
      url: "/api/providers"
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body).not.toContain(apiKey);
    expect(listResponse.json().providers).toHaveLength(1);

    const deleteResponse = await server.inject({
      method: "DELETE",
      url: `/api/providers/${provider.id}`
    });

    expect(deleteResponse.statusCode).toBe(204);
  });

  it("tests a provider connection with an authorization header", async () => {
    await withHttpServer((request, response) => {
      response.statusCode =
        request.headers.authorization === "Bearer sk-connection-test" ? 200 : 401;
      response.end(JSON.stringify({ ok: true }));
    }, async (baseUrl) => {
      const server = buildServer();

      const response = await server.inject({
        method: "POST",
        url: "/api/providers/test",
        payload: {
          baseUrl,
          apiKey: "sk-connection-test"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        statusCode: 200
      });
    });
  });

  it("sanitizes provider auth failures", async () => {
    const apiKey = "sk-invalid-secret";

    await withHttpServer((_request, response) => {
      response.statusCode = 401;
      response.end("nope");
    }, async (baseUrl) => {
      const server = buildServer();

      const response = await server.inject({
        method: "POST",
        url: "/api/providers/test",
        payload: {
          baseUrl,
          apiKey
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.body).not.toContain(apiKey);
      expect(response.json()).toEqual({
        error: {
          code: "PROVIDER_AUTH_FAILED",
          message: "Provider rejected the API Key.",
          detail: "Provider returned HTTP 401."
        }
      });
    });
  });

  it("blocks localhost provider URLs in production mode", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const server = buildServer();
      const response = await server.inject({
        method: "POST",
        url: "/api/providers/test",
        payload: {
          baseUrl: "https://localhost:3001",
          apiKey: "sk-test-secret"
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain("sk-test-secret");
      expect(response.json()).toMatchObject({
        error: {
          code: "PROVIDER_URL_BLOCKED"
        }
      });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("blocks private network provider URLs when saving", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/providers",
      payload: {
        name: "Private Provider",
        baseUrl: "https://192.168.1.10/v1",
        apiKey: "sk-private-secret"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain("sk-private-secret");
    expect(response.json()).toMatchObject({
      error: {
        code: "PROVIDER_URL_BLOCKED",
        message: "Provider URL cannot target private network addresses."
      }
    });
  });

  it("blocks localhost provider URLs when the local URL switch is disabled", async () => {
    const previousAllowLocal = process.env.ALLOW_LOCAL_PROVIDER_URLS;
    process.env.ALLOW_LOCAL_PROVIDER_URLS = "false";

    try {
      const server = buildServer();
      const response = await server.inject({
        method: "POST",
        url: "/api/providers",
        payload: {
          name: "Local Provider",
          baseUrl: "http://127.0.0.1:3001/v1",
          apiKey: "sk-local-secret"
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain("sk-local-secret");
      expect(response.json()).toMatchObject({
        error: {
          code: "PROVIDER_URL_BLOCKED"
        }
      });
    } finally {
      process.env.ALLOW_LOCAL_PROVIDER_URLS = previousAllowLocal;
    }
  });
});
