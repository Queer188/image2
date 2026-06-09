import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";

const originalCorsOrigin = process.env.CORS_ORIGIN;

afterEach(() => {
  if (originalCorsOrigin === undefined) {
    delete process.env.CORS_ORIGIN;
  } else {
    process.env.CORS_ORIGIN = originalCorsOrigin;
  }
});

describe("security controls", () => {
  it("allows configured CORS origins and rejects unconfigured preflights", async () => {
    process.env.CORS_ORIGIN = "https://app.example.com";
    const server = buildServer();

    const allowed = await server.inject({
      method: "OPTIONS",
      url: "/api/providers",
      headers: {
        origin: "https://app.example.com",
        "access-control-request-method": "POST"
      }
    });

    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://app.example.com"
    );

    const blocked = await server.inject({
      method: "OPTIONS",
      url: "/api/providers",
      headers: {
        origin: "https://evil.example.com",
        "access-control-request-method": "POST"
      }
    });

    expect(blocked.statusCode).toBe(403);
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("redacts common secret patterns from public error details", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/providers/test",
      payload: {
        baseUrl: "notaurl Bearer sk-leaked-secret",
        apiKey: "sk-request-secret"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain("sk-leaked-secret");
    expect(response.body).not.toContain("sk-request-secret");
  });
});
