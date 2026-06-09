import { randomUUID } from "node:crypto";
import type {
  GeneratedImage,
  ImageModel,
  ImageModelCapability,
  ProviderRuntimeConfig
} from "@image2/shared";
import { AppError, sanitizeErrorDetail } from "../errors.js";
import { assertSafeProviderUrl } from "../url-policy.js";
import type {
  ImageProviderAdapter,
  ImageProviderGenerateRequest
} from "./base.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const GENERATION_TIMEOUT_MS = 60_000;
const MODEL_DETAIL_LIMIT = 240;
const GENERATION_DETAIL_LIMIT = 240;
const KNOWN_IMAGE_MODEL_PATTERNS = [
  "dall-e",
  "gpt-image",
  "image",
  "imagen",
  "flux",
  "sdxl",
  "stable-diffusion",
  "midjourney"
];

type ModelRecord = Record<string, unknown>;
type ImageRecord = Record<string, unknown>;

export function endpointFromBaseUrl(baseUrl: string, endpoint: string): Promise<URL> {
  return assertSafeProviderUrl(baseUrl).then((url) => {
    const segments = url.pathname.split("/").filter(Boolean);
    const endpointSegments = endpoint.split("/").filter(Boolean);
    const alreadyAtEndpoint = endpointSegments.every(
      (segment, index) =>
        segments[segments.length - endpointSegments.length + index] === segment
    );

    if (!alreadyAtEndpoint) {
      segments.push(...endpointSegments);
    }

    url.pathname = `/${segments.join("/")}`;
    url.search = "";
    url.hash = "";
    return url;
  });
}

function asModelArray(payload: unknown): ModelRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [payload.data, payload.models, payload.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }

  return [];
}

function isRecord(value: unknown): value is ModelRecord {
  return typeof value === "object" && value !== null;
}

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function collectTokens(record: ModelRecord): string[] {
  const tokens = [
    record.id,
    record.name,
    record.type,
    record.task,
    record.mode,
    record.object
  ].map(normalizeToken);

  for (const key of ["capability", "capabilities", "modalities", "features"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      tokens.push(...value.map(normalizeToken));
    } else {
      tokens.push(normalizeToken(value));
    }
  }

  return tokens.filter(Boolean);
}

function collectExplicitCapabilityTokens(record: ModelRecord): string[] {
  const tokens: string[] = [];

  for (const key of ["capability", "capabilities", "features", "task", "mode", "type"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      tokens.push(...value.map(normalizeToken));
    } else {
      tokens.push(normalizeToken(value));
    }
  }

  return tokens.filter(Boolean);
}

function capabilitiesFromTokens(tokens: string[]): Set<ImageModelCapability> {
  const joined = tokens.join(" ");
  const capabilities = new Set<ImageModelCapability>();

  if (
    joined.includes("text-to-image") ||
    joined.includes("txt2img") ||
    joined.includes("image-generation")
  ) {
    capabilities.add("text-to-image");
  }

  if (
    joined.includes("image-to-image") ||
    joined.includes("img2img") ||
    joined.includes("image-edit") ||
    joined.includes("inpaint")
  ) {
    capabilities.add("image-to-image");
  }

  return capabilities;
}

function inferCapabilities(record: ModelRecord): ImageModelCapability[] {
  const explicitCapabilities = capabilitiesFromTokens(
    collectExplicitCapabilityTokens(record)
  );
  if (explicitCapabilities.size > 0) {
    return [...explicitCapabilities];
  }

  const tokens = collectTokens(record);
  const joined = tokens.join(" ");
  const capabilities = capabilitiesFromTokens(tokens);

  if (KNOWN_IMAGE_MODEL_PATTERNS.some((pattern) => joined.includes(pattern))) {
    capabilities.add("text-to-image");
  }

  return [...capabilities];
}

function optionalStringArray(record: ModelRecord, keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const strings = value.filter((item): item is string => typeof item === "string");
      if (strings.length > 0) {
        return strings;
      }
    }
  }

  return undefined;
}

function sizeFromRatio(ratio?: string): string | undefined {
  if (!ratio) {
    return undefined;
  }

  const normalized = ratio.trim().toLowerCase();
  if (/^\d+x\d+$/.test(normalized)) {
    return normalized;
  }

  const sizes: Record<string, string> = {
    "1:1": "1024x1024",
    "4:3": "1024x768",
    "3:4": "768x1024",
    "16:9": "1792x1024",
    "9:16": "1024x1792"
  };

  return sizes[normalized];
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asImageArray(payload: unknown): ImageRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [payload.data, payload.images, payload.output, payload.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }

  return [];
}

function dataUrlFromB64(value: unknown, mimeType = "image/png"): string | undefined {
  const b64 = stringFromUnknown(value);
  if (!b64) {
    return undefined;
  }

  if (b64.startsWith("data:")) {
    return b64;
  }

  return `data:${mimeType};base64,${b64}`;
}

function imageFromRecord(record: ImageRecord, index: number): GeneratedImage | undefined {
  const url =
    stringFromUnknown(record.url) ??
    stringFromUnknown(record.image_url) ??
    stringFromUnknown(record.imageUrl) ??
    dataUrlFromB64(record.b64_json) ??
    dataUrlFromB64(record.b64Json) ??
    dataUrlFromB64(record.base64);

  if (!url) {
    return undefined;
  }

  return {
    id: stringFromUnknown(record.id) ?? randomUUID(),
    url,
    width: numberFromUnknown(record.width),
    height: numberFromUnknown(record.height),
    seed: numberFromUnknown(record.seed),
    metadata: {
      index,
      revisedPrompt: stringFromUnknown(record.revised_prompt),
      finishReason: stringFromUnknown(record.finish_reason)
    }
  };
}

function generationPayload(
  request: ImageProviderGenerateRequest
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: request.modelId,
    prompt: request.prompt,
    n: request.count ?? 1
  };
  const size = sizeFromRatio(request.ratio);

  if (size) {
    payload.size = size;
  }

  if (request.quality) {
    payload.quality = request.quality;
  }

  if (request.negativePrompt) {
    payload.negative_prompt = request.negativePrompt;
  }

  if (request.seed !== undefined) {
    payload.seed = request.seed;
  }

  return payload;
}

function dataUrlToBlob(dataUrl: string, mimeType: string): Blob {
  const prefix = `data:${mimeType};base64,`;
  const base64 = dataUrl.startsWith(prefix)
    ? dataUrl.slice(prefix.length)
    : dataUrl.split(",")[1];
  const bytes = Buffer.from(base64, "base64");
  return new Blob([bytes], { type: mimeType });
}

function imageEditFormData(request: ImageProviderGenerateRequest): FormData {
  if (!request.inputImage) {
    throw new AppError(
      "BAD_REQUEST",
      "An uploaded input image is required for image-to-image generation.",
      400
    );
  }

  const formData = new FormData();
  const size = sizeFromRatio(request.ratio);

  formData.set("model", request.modelId);
  formData.set("prompt", request.prompt);
  formData.set("n", String(request.count ?? 1));
  formData.set(
    "image",
    dataUrlToBlob(request.inputImage.dataUrl, request.inputImage.mimeType),
    `${request.inputImage.id}.${request.inputImage.mimeType.split("/")[1]}`
  );

  if (size) {
    formData.set("size", size);
  }

  if (request.quality) {
    formData.set("quality", request.quality);
  }

  if (request.negativePrompt) {
    formData.set("negative_prompt", request.negativePrompt);
  }

  if (request.seed !== undefined) {
    formData.set("seed", String(request.seed));
  }

  if (request.strength !== undefined) {
    formData.set("strength", String(request.strength));
  }

  return formData;
}

function modelFromRecord(record: ModelRecord, providerId: string): ImageModel | undefined {
  const id = typeof record.id === "string" ? record.id : undefined;
  if (!id) {
    return undefined;
  }

  const capabilities = inferCapabilities(record);
  if (capabilities.length === 0) {
    return undefined;
  }

  return {
    id,
    name: typeof record.name === "string" ? record.name : id,
    providerId,
    capabilities,
    supportedRatios: optionalStringArray(record, [
      "supportedRatios",
      "supported_ratios",
      "ratios",
      "sizes"
    ]),
    supportedQualities: optionalStringArray(record, [
      "supportedQualities",
      "supported_qualities",
      "qualities"
    ]),
    raw: record
  };
}

function summarizeProviderBody(body: string, apiKey: string): string {
  const normalized = body.replace(/\s+/g, " ").trim().slice(0, MODEL_DETAIL_LIMIT);
  return sanitizeErrorDetail(normalized || "No response body.", apiKey);
}

export function summarizeGenerationBody(body: string, apiKey: string): string {
  const normalized = body
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GENERATION_DETAIL_LIMIT);
  return sanitizeErrorDetail(normalized || "No response body.", apiKey);
}

export function imagesFromGenerationPayload(payload: unknown): GeneratedImage[] {
  const images = asImageArray(payload)
    .map((record, index) => imageFromRecord(record, index))
    .filter((image): image is GeneratedImage => image !== undefined);

  if (images.length === 0) {
    throw new AppError(
      "PROVIDER_GENERATION_FAILED",
      "Provider did not return any images.",
      502
    );
  }

  return images;
}

export const openAiCompatibleAdapter: ImageProviderAdapter = {
  async testConnection() {
    return;
  },

  async listModels(
    config: ProviderRuntimeConfig,
    providerId: string
  ): Promise<ImageModel[]> {
    const url = await endpointFromBaseUrl(config.baseUrl, "models");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${config.apiKey}`
        },
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
          "PROVIDER_MODEL_LIST_FAILED",
          "Provider returned an error while listing models.",
          502,
          `HTTP ${response.status}: ${summarizeProviderBody(body, config.apiKey)}`
        );
      }

      let payload: unknown;
      try {
        payload = body ? JSON.parse(body) : {};
      } catch {
        throw new AppError(
          "PROVIDER_MODEL_LIST_FAILED",
          "Provider returned invalid JSON while listing models.",
          502
        );
      }

      return asModelArray(payload)
        .map((record) => modelFromRecord(record, providerId))
        .filter((model): model is ImageModel => model !== undefined)
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      const detail =
        error instanceof Error
          ? sanitizeErrorDetail(error.message, config.apiKey)
          : "Model discovery failed.";

      throw new AppError(
        "PROVIDER_MODEL_LIST_FAILED",
        "Unable to fetch models from provider.",
        502,
        detail
      );
    } finally {
      clearTimeout(timeout);
    }
  },

  async generateImage(
    config: ProviderRuntimeConfig,
    request: ImageProviderGenerateRequest
  ): Promise<GeneratedImage[]> {
    const isImageToImage = request.mode === "image-to-image";
    const url = await endpointFromBaseUrl(
      config.baseUrl,
      isImageToImage ? "images/edits" : "images/generations"
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
    const requestBody = isImageToImage
      ? imageEditFormData(request)
      : JSON.stringify(generationPayload(request));
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${config.apiKey}`
    };

    if (!isImageToImage) {
      headers["content-type"] = "application/json";
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: requestBody,
        redirect: "manual",
        signal: controller.signal
      });

      const responseBody = await response.text();

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
          `HTTP ${response.status}: ${summarizeGenerationBody(responseBody, config.apiKey)}`
        );
      }

      let payload: unknown;
      try {
        payload = responseBody ? JSON.parse(responseBody) : {};
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
};
