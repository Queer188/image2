import Fastify from "fastify";
import type { HealthStatus } from "@image2/shared";
import { AppError } from "./errors.js";
import { registerModelRoutes } from "./model-routes.js";
import { registerProviderRoutes } from "./provider-routes.js";

export function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: [
        "req.headers.authorization",
        "headers.authorization",
        "body.apiKey",
        "request.body.apiKey"
      ]
    }
  });

  server.get("/health", async (): Promise<HealthStatus> => ({
    status: "ok",
    service: "image2-server"
  }));

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          detail: error.detail
        }
      });
    }

    server.log.error({ err: error }, "Unhandled server error");
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected server error occurred."
      }
    });
  });

  void registerProviderRoutes(server);
  void registerModelRoutes(server);

  return server;
}
