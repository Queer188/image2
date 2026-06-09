import type {
  ProviderListResponse,
  ProviderRuntimeConfig,
  ProviderTestResponse,
  TestProviderRequest
} from "@image2/shared";
import type { FastifyInstance } from "fastify";
import { testProviderConnection } from "./connection-test.js";
import { AppError } from "./errors.js";
import {
  createProvider,
  deleteProvider,
  getProviderRuntimeConfig,
  listProviders,
  recordProviderTest,
  updateProvider
} from "./provider-store.js";

function getProviderIdParam(params: unknown): string {
  if (
    typeof params === "object" &&
    params !== null &&
    "id" in params &&
    typeof params.id === "string"
  ) {
    return params.id;
  }

  throw new AppError("BAD_REQUEST", "Provider id is required.", 400);
}

function resolveTestConfig(body: Partial<TestProviderRequest>): {
  config: ProviderRuntimeConfig;
  providerId?: string;
} {
  if (body.providerId) {
    return {
      config: getProviderRuntimeConfig(body.providerId),
      providerId: body.providerId
    };
  }

  if (!body.baseUrl?.trim() || !body.apiKey?.trim()) {
    throw new AppError(
      "BAD_REQUEST",
      "API Base URL and API Key are required for connection testing.",
      400
    );
  }

  return {
    config: {
      baseUrl: body.baseUrl.trim(),
      apiKey: body.apiKey.trim()
    }
  };
}

export async function registerProviderRoutes(server: FastifyInstance) {
  server.get("/api/providers", async (): Promise<ProviderListResponse> => ({
    providers: listProviders()
  }));

  server.post("/api/providers", async (request, reply) => {
    const provider = createProvider(request.body ?? {});
    return reply.code(201).send(provider);
  });

  server.put("/api/providers/:id", async (request) => {
    const id = getProviderIdParam(request.params);
    return updateProvider(id, request.body ?? {});
  });

  server.delete("/api/providers/:id", async (request, reply) => {
    const id = getProviderIdParam(request.params);
    deleteProvider(id);
    return reply.code(204).send();
  });

  server.post("/api/providers/test", async (request) => {
    const { config, providerId } = resolveTestConfig(
      (request.body ?? {}) as Partial<TestProviderRequest>
    );
    let result: ProviderTestResponse;

    try {
      result = await testProviderConnection(config);
    } catch (error) {
      if (providerId && error instanceof AppError) {
        recordProviderTest(providerId, {
          ok: false,
          message: error.message,
          testedAt: new Date().toISOString()
        });
      }

      throw error;
    }

    if (providerId) {
      recordProviderTest(providerId, result);
    }

    return result;
  });
}
