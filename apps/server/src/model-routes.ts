import type { ImageModel, ModelListRequest, ModelListResponse } from "@image2/shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "./errors.js";
import { getProviderConfig, getProviderRuntimeConfig } from "./provider-store.js";
import { getImageProviderAdapter } from "./provider-adapters.js";

function resolveModelListRequest(body: Partial<ModelListRequest>): ModelListRequest {
  if (!body.providerId?.trim()) {
    throw new AppError("BAD_REQUEST", "Provider id is required.", 400);
  }

  return {
    providerId: body.providerId.trim()
  };
}

function toPublicModel(model: ImageModel): ImageModel {
  return {
    id: model.id,
    name: model.name,
    providerId: model.providerId,
    capabilities: model.capabilities,
    supportedRatios: model.supportedRatios,
    supportedQualities: model.supportedQualities
  };
}

export async function registerModelRoutes(server: FastifyInstance) {
  server.post("/api/models/list", async (request): Promise<ModelListResponse> => {
    const { providerId } = resolveModelListRequest(
      (request.body ?? {}) as Partial<ModelListRequest>
    );
    const provider = getProviderConfig(providerId);
    const config = getProviderRuntimeConfig(providerId);
    const adapter = getImageProviderAdapter(provider.providerType);
    const models = await adapter.listModels(config, providerId);

    return {
      models: models.map(toPublicModel),
      fetchedAt: new Date().toISOString()
    };
  });
}
