import type {
  GenerateImageRequest,
  GenerateImageResponse
} from "@image2/shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "./errors.js";
import { getProviderRuntimeConfig } from "./provider-store.js";
import { image2CompatibleAdapter } from "./providers/image2-compatible.js";

const MAX_IMAGE_COUNT = 4;

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function resolveGenerateRequest(body: Partial<GenerateImageRequest>): GenerateImageRequest {
  const providerId = optionalTrimmedString(body.providerId);
  const modelId = optionalTrimmedString(body.modelId);
  const prompt = optionalTrimmedString(body.prompt);

  if (!providerId) {
    throw new AppError("BAD_REQUEST", "Provider id is required.", 400);
  }

  if (!modelId) {
    throw new AppError("BAD_REQUEST", "Model id is required.", 400);
  }

  if (body.mode !== "text-to-image") {
    throw new AppError(
      "BAD_REQUEST",
      "Only text-to-image generation is supported in this phase.",
      400
    );
  }

  if (!prompt) {
    throw new AppError("BAD_REQUEST", "Prompt is required.", 400);
  }

  const count = body.count ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > MAX_IMAGE_COUNT) {
    throw new AppError(
      "BAD_REQUEST",
      `Image count must be between 1 and ${MAX_IMAGE_COUNT}.`,
      400
    );
  }

  return {
    providerId,
    modelId,
    mode: "text-to-image",
    prompt,
    negativePrompt: optionalTrimmedString(body.negativePrompt),
    ratio: optionalTrimmedString(body.ratio),
    quality: optionalTrimmedString(body.quality),
    count,
    seed: optionalInteger(body.seed)
  };
}

export async function registerImageRoutes(server: FastifyInstance) {
  server.post(
    "/api/images/generate",
    async (request): Promise<GenerateImageResponse> => {
      const generationRequest = resolveGenerateRequest(
        (request.body ?? {}) as Partial<GenerateImageRequest>
      );
      const config = getProviderRuntimeConfig(generationRequest.providerId);
      const images = await image2CompatibleAdapter.generateImage(
        config,
        generationRequest
      );

      return {
        images,
        generatedAt: new Date().toISOString()
      };
    }
  );
}

