import { describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";

describe("health route", () => {
  it("returns service health", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "image2-server"
    });
  });
});
