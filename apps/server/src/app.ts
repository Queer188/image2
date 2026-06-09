import Fastify from "fastify";
import type { HealthStatus } from "@image2/shared";

export function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  server.get("/health", async (): Promise<HealthStatus> => ({
    status: "ok",
    service: "image2-server"
  }));

  return server;
}
