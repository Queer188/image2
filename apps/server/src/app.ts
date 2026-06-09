import Fastify from "fastify";
import type { HealthStatus } from "@image2/shared";
import { AppError, sanitizeErrorDetail } from "./errors.js";
import { registerImageRoutes } from "./image-routes.js";
import { registerModelRoutes } from "./model-routes.js";
import { registerProviderRoutes } from "./provider-routes.js";

function allowedCorsOrigins(): Set<string> {
  const configured = process.env.CORS_ORIGIN;
  if (configured) {
    return new Set(
      configured
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    );
  }

  if (process.env.NODE_ENV === "production") {
    return new Set();
  }

  return new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
}

export function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: [
        "req.headers.authorization",
        "headers.authorization",
        "body.apiKey",
        "request.body.apiKey",
        "body.dataUrl",
        "request.body.dataUrl",
        "body.inputImage.dataUrl",
        "request.body.inputImage.dataUrl"
      ]
    }
  });
  const corsOrigins = allowedCorsOrigins();

  server.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;

    if (origin && corsOrigins.has(origin)) {
      reply.header("access-control-allow-origin", origin);
      reply.header("vary", "Origin");
      reply.header("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
      reply.header("access-control-allow-headers", "content-type,authorization");
    }

    if (request.method === "OPTIONS") {
      return reply.code(origin && !corsOrigins.has(origin) ? 403 : 204).send();
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
          detail: error.detail ? sanitizeErrorDetail(error.detail) : undefined
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
  void registerImageRoutes(server);

  return server;
}
