import type {
  GenerateImageRequest,
  GenerateImageResponse,
  UploadImageRequest,
  UploadImageResponse
} from "@image2/shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "./errors.js";
import { saveHistoryRecord } from "./history-store.js";
import {
  getUploadedImage,
  MAX_UPLOAD_BODY_BYTES,
  saveUploadedImage
} from "./image-upload-store.js";
import { getProviderConfig, getProviderRuntimeConfig } from "./provider-store.js";
import type { ImageProviderGenerateRequest } from "./providers/base.js";
import { image2CompatibleAdapter } from "./providers/image2-compatible.js";

const MAX_IMAGE_COUNT = 4;

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resolveGenerateRequest(
  body: Partial<GenerateImageRequest>
): GenerateImageRequest {
  const providerId = optionalTrimmedString(body.providerId);
  const modelId = optionalTrimmedString(body.modelId);
  const prompt = optionalTrimmedString(body.prompt);
  const mode = body.mode;

  if (!providerId) {
    throw new AppError("BAD_REQUEST", "Provider id is required.", 400);
  }

  if (!modelId) {
    throw new AppError("BAD_REQUEST", "Model id is required.", 400);
  }

  if (mode !== "text-to-image" && mode !== "image-to-image") {
    throw new AppError("BAD_REQUEST", "Generation mode is required.", 400);
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

  const strength = optionalFiniteNumber(body.strength);
  if (
    mode === "image-to-image" &&
    (strength === undefined || strength < 0 || strength > 1)
  ) {
    throw new AppError(
      "BAD_REQUEST",
      "Strength must be a number between 0 and 1.",
      400
    );
  }

  const inputImageId = optionalTrimmedString(body.inputImageId);
  if (mode === "image-to-image" && !inputImageId) {
    throw new AppError(
      "BAD_REQUEST",
      "An uploaded input image is required for image-to-image generation.",
      400
    );
  }

  return {
    providerId,
    modelId,
    modelName: optionalTrimmedString(body.modelName),
    mode,
    prompt,
    negativePrompt: optionalTrimmedString(body.negativePrompt),
    ratio: optionalTrimmedString(body.ratio),
    quality: optionalTrimmedString(body.quality),
    count,
    seed: optionalInteger(body.seed),
    strength,
    inputImageId
  };
}

export async function registerImageRoutes(server: FastifyInstance) {
  server.post(
    "/api/images/upload",
    {
      bodyLimit: MAX_UPLOAD_BODY_BYTES
    },
    async (request, reply): Promise<UploadImageResponse> => {
      const upload = saveUploadedImage(
        (request.body ?? {}) as Partial<UploadImageRequest>
      );
      return reply.code(201).send(upload);
    }
  );

  server.post(
    "/api/images/generate",
    async (request): Promise<GenerateImageResponse> => {
      const generationRequest = resolveGenerateRequest(
        (request.body ?? {}) as Partial<GenerateImageRequest>
      );
      const config = getProviderRuntimeConfig(generationRequest.providerId);
      const provider = getProviderConfig(generationRequest.providerId);
      const adapterRequest: ImageProviderGenerateRequest = {
        ...generationRequest
      };
      let inputImageMetadata:
        | {
            fileName?: string;
            mimeType: "image/png" | "image/jpeg" | "image/webp";
            sizeBytes: number;
          }
        | undefined;

      if (generationRequest.mode === "image-to-image") {
        const inputImage = getUploadedImage(generationRequest.inputImageId ?? "");
        inputImageMetadata = {
          fileName: inputImage.fileName,
          mimeType: inputImage.mimeType,
          sizeBytes: inputImage.sizeBytes
        };
        adapterRequest.inputImage = {
          id: inputImage.id,
          mimeType: inputImage.mimeType,
          dataUrl: inputImage.dataUrl
        };
      }

      const images = await image2CompatibleAdapter.generateImage(
        config,
        adapterRequest
      );
      const generatedAt = new Date().toISOString();
      const historyRecord = saveHistoryRecord({
        createdAt: generatedAt,
        providerId: provider.id,
        providerName: provider.name,
        modelId: generationRequest.modelId,
        modelName: generationRequest.modelName ?? generationRequest.modelId,
        mode: generationRequest.mode,
        prompt: generationRequest.prompt,
        negativePrompt: generationRequest.negativePrompt,
        ratio: generationRequest.ratio,
        quality: generationRequest.quality,
        count: generationRequest.count,
        seed: generationRequest.seed,
        strength: generationRequest.strength,
        inputImage: inputImageMetadata,
        images
      });

      return {
        images,
        generatedAt,
        historyRecord
      };
    }
  );
}

