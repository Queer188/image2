import type { GeneratedImage, ProviderRuntimeConfig } from "@image2/shared";
import { AppError, sanitizeErrorDetail } from "../errors.js";
import type {
  ImageProviderAdapter,
  ImageProviderGenerateRequest
} from "./base.js";
import {
  endpointFromBaseUrl,
  imagesFromGenerationPayload,
  openAiCompatibleAdapter,
  summarizeGenerationBody
} from "./openai-compatible.js";

const GENERATION_TIMEOUT_MS = 60_000;

function image2Payload(request: ImageProviderGenerateRequest): Record<string, unknown> {
  if (!request.inputImage) {
    throw new AppError(
      "BAD_REQUEST",
      "An uploaded input image is required for image-to-image generation.",
      400
    );
  }

  const payload: Record<string, unknown> = {
    model: request.modelId,
    mode: "image-to-image",
    prompt: request.prompt,
    n: request.count ?? 1,
    count: request.count ?? 1,
    image: request.inputImage.dataUrl,
    input_image: request.inputImage.dataUrl,
    inputImage: request.inputImage.dataUrl,
    mime_type: request.inputImage.mimeType,
    strength: request.strength ?? 0.5
  };

  if (request.ratio) {
    payload.ratio = request.ratio;
  }

  if (request.quality) {
    payload.quality = request.quality;
  }

  if (request.negativePrompt) {
    payload.negative_prompt = request.negativePrompt;
    payload.negativePrompt = request.negativePrompt;
  }

  if (request.seed !== undefined) {
    payload.seed = request.seed;
  }

  return payload;
}

function shouldTryOpenAiEdit(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.code === "PROVIDER_GENERATION_FAILED" &&
    (error.detail?.startsWith("HTTP 404:") === true ||
      error.detail?.startsWith("HTTP 405:") === true)
  );
}

async function generateImage2Json(
  config: ProviderRuntimeConfig,
  request: ImageProviderGenerateRequest
): Promise<GeneratedImage[]> {
  const url = await endpointFromBaseUrl(config.baseUrl, "images/generations");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(image2Payload(request)),
      redirect: "manual",
      signal: controller.signal
    });

    const body = await response.text();

    if (response.status === 401 || response.status === 403) {
      throw new AppError(
        "PROVIDER_AUTH_FAILED",
        "Provider rejected the API Key.",
        401,
        `Provider returned HTTP ${response.status}.`
      );
    }

    if (!response.ok) {
      throw new AppError(
        "PROVIDER_GENERATION_FAILED",
        "Provider returned an error while generating images.",
        502,
        `HTTP ${response.status}: ${summarizeGenerationBody(body, config.apiKey)}`
      );
    }

    let payload: unknown;
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      throw new AppError(
        "PROVIDER_GENERATION_FAILED",
        "Provider returned invalid JSON while generating images.",
        502
      );
    }

    return imagesFromGenerationPayload(payload);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const detail =
      error instanceof Error
        ? sanitizeErrorDetail(error.message, config.apiKey)
        : "Image generation failed.";

    throw new AppError(
      "PROVIDER_GENERATION_FAILED",
      "Unable to generate images with provider.",
      502,
      detail
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const image2CompatibleAdapter: ImageProviderAdapter = {
  testConnection: openAiCompatibleAdapter.testConnection,
  listModels: openAiCompatibleAdapter.listModels,

  async generateImage(config, request) {
    if (request.mode !== "image-to-image") {
      return openAiCompatibleAdapter.generateImage(config, request);
    }

    try {
      return await generateImage2Json(config, request);
    } catch (error) {
      if (shouldTryOpenAiEdit(error)) {
        return openAiCompatibleAdapter.generateImage(config, request);
      }

      throw error;
    }
  }
};
