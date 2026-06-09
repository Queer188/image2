import { randomUUID } from "node:crypto";
import type {
  GeneratedImage,
  ImageModel,
  ImageModelCapability,
  ProviderCapabilityOverride,
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
  "image-gen",
  "image_generation",
  "image-generation",
  "imagen",
  "flux",
  "sdxl",
  "stable-diffusion",
  "midjourney"
];
const NON_GENERATION_IMAGE_PATTERNS = [
  "vision",
  "embedding",
  "caption",
  "classification",
  "moderation",
  "ocr"
];
const MODEL_ARRAY_KEYS = [
  "data",
  "models",
  "items",
  "result",
  "results",
  "response",
  "available_models",
  "availableModels"
];
const IMAGE_ARRAY_KEYS = [
  "data",
  "images",
  "output",
  "items",
  "result",
  "results",
  "artifacts",
  "generations",
  "predictions"
];

type ModelRecord = Record<string, unknown>;
type ImageRecord = Record<string, unknown>;
type ImageEntry = ImageRecord | string;

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

function isRecord(value: unknown): value is ModelRecord {
  return typeof value === "object" && value !== null;
}

function entriesFromRecordMap(value: unknown): ModelRecord[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value)
    .map(([key, item]) => {
      if (!isRecord(item)) {
        return undefined;
      }

      return typeof item.id === "string" ? item : { id: key, ...item };
    })
    .filter((item): item is ModelRecord => item !== undefined);
}

function arrayFromPayload(
  payload: unknown,
  preferredKeys: string[],
  depth = 0
): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload) || depth > 3) {
    return [];
  }

  for (const key of preferredKeys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }

    const nested = arrayFromPayload(value, preferredKeys, depth + 1);
    if (nested.length > 0) {
      return nested;
    }
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function asModelArray(payload: unknown): ModelRecord[] {
  const array = arrayFromPayload(payload, MODEL_ARRAY_KEYS).filter(isRecord);
  if (array.length > 0) {
    return array;
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of MODEL_ARRAY_KEYS) {
    const mapEntries = entriesFromRecordMap(payload[key]);
    if (mapEntries.length > 0) {
      return mapEntries;
    }
  }

  return entriesFromRecordMap(payload);
}

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function pushTokenValue(tokens: string[], value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      pushTokenValue(tokens, item);
    }
    return;
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      pushTokenValue(tokens, item);
    }
    return;
  }

  const token = normalizeToken(value);
  if (token) {
    tokens.push(token);
  }
}

function collectTokens(record: ModelRecord): string[] {
  const tokens = [
    record.id,
    record.model,
    record.name,
    record.display_name,
    record.model_name,
    record.type,
    record.task,
    record.mode,
    record.object
  ].map(normalizeToken);

  for (const key of [
    "capability",
    "capabilities",
    "modalities",
    "features",
    "supported_modes"
  ]) {
    pushTokenValue(tokens, record[key]);
  }

  return tokens.filter(Boolean);
}

function collectExplicitCapabilityTokens(record: ModelRecord): string[] {
  const tokens: string[] = [];

  for (const key of ["capability", "capabilities", "features", "task", "mode", "type"]) {
    pushTokenValue(tokens, record[key]);
  }

  return tokens.filter(Boolean);
}

function capabilitiesFromTokens(tokens: string[]): Set<ImageModelCapability> {
  const joined = tokens.join(" ");
  const capabilities = new Set<ImageModelCapability>();

  if (
    joined.includes("text-to-image") ||
    joined.includes("text to image") ||
    joined.includes("txt2img") ||
    joined.includes("text2img") ||
    joined.includes("image-generation") ||
    joined.includes("image generation") ||
    joined.includes("image_generation")
  ) {
    capabilities.add("text-to-image");
  }

  if (
    joined.includes("image-to-image") ||
    joined.includes("image to image") ||
    joined.includes("img2img") ||
    joined.includes("image-edit") ||
    joined.includes("image edit") ||
    joined.includes("inpaint") ||
    joined.includes("outpaint") ||
    joined.includes("variation")
  ) {
    capabilities.add("image-to-image");
  }

  return capabilities;
}

function overrideCapabilities(
  record: ModelRecord,
  overrides: ProviderCapabilityOverride[] | undefined
): ImageModelCapability[] | undefined {
  if (!overrides || overrides.length === 0) {
    return undefined;
  }

  const ids = [
    record.id,
    record.model,
    record.name,
    record.model_name,
    record.slug,
    record.value
  ]
    .map(normalizeToken)
    .filter(Boolean);

  const override = overrides.find((item) => {
    const modelId = item.modelId.toLowerCase();
    return modelId === "*" || ids.includes(modelId);
  });

  return override ? [...new Set(override.capabilities)] : undefined;
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
  const hasExcludedPattern = NON_GENERATION_IMAGE_PATTERNS.some((pattern) =>
    joined.includes(pattern)
  );

  if (
    capabilities.size === 0 &&
    !hasExcludedPattern &&
    (KNOWN_IMAGE_MODEL_PATTERNS.some((pattern) => joined.includes(pattern)) ||
      /\bimage\b/.test(joined))
  ) {
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
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asImageEntries(payload: unknown): ImageEntry[] {
  const array = arrayFromPayload(payload, IMAGE_ARRAY_KEYS);
  if (array.length > 0) {
    return array.filter(
      (item): item is ImageEntry => isRecord(item) || typeof item === "string"
    );
  }

  if (isRecord(payload)) {
    return [payload];
  }

  return [];
}

function looksLikeBase64(value: string): boolean {
  return (
    value.length >= 8 &&
    /^[A-Za-z0-9+/=_\-\r\n]+$/.test(value) &&
    !/^https?:\/\//i.test(value)
  );
}

function dataUrlFromB64(value: unknown, mimeType = "image/png"): string | undefined {
  const b64 = stringFromUnknown(value);
  if (!b64) {
    return undefined;
  }

  if (b64.startsWith("data:")) {
    return b64;
  }

  if (!looksLikeBase64(b64)) {
    return undefined;
  }

  return `data:${mimeType};base64,${b64}`;
}

function stringImageUrl(value: unknown): string | undefined {
  const url = stringFromUnknown(value);
  if (!url) {
    return undefined;
  }

  if (url.startsWith("data:") || /^https?:\/\//i.test(url)) {
    return url;
  }

  return looksLikeBase64(url) ? `data:image/png;base64,${url}` : url;
}

function firstStringFromRecord(record: ImageRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    const url = stringImageUrl(value);
    if (url) {
      return url;
    }

    if (isRecord(value)) {
      const nested = firstStringFromRecord(value, keys);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}

function mimeTypeFromRecord(record: ImageRecord): string {
  return (
    stringFromUnknown(record.mime_type) ??
    stringFromUnknown(record.mimeType) ??
    stringFromUnknown(record.content_type) ??
    stringFromUnknown(record.contentType) ??
    "image/png"
  );
}

function imageFromRecord(entry: ImageEntry, index: number): GeneratedImage | undefined {
  if (typeof entry === "string") {
    const url = stringImageUrl(entry);
    return url
      ? {
          id: randomUUID(),
          url,
          metadata: {
            index
          }
        }
      : undefined;
  }

  const record = entry;
  const url =
    firstStringFromRecord(record, [
      "url",
      "uri",
      "href",
      "link",
      "image_url",
      "imageUrl",
      "output_url",
      "outputUrl",
      "result_url",
      "resultUrl",
      "data_url",
      "dataUrl",
      "image",
      "asset"
    ]) ??
    stringFromUnknown(record.url) ??
    dataUrlFromB64(record.b64_json) ??
    dataUrlFromB64(record.base64_json) ??
    dataUrlFromB64(record.b64Json) ??
    dataUrlFromB64(record.base64, mimeTypeFromRecord(record)) ??
    dataUrlFromB64(record.image_base64, mimeTypeFromRecord(record)) ??
    dataUrlFromB64(record.imageBase64, mimeTypeFromRecord(record)) ??
    dataUrlFromB64(record.content, mimeTypeFromRecord(record)) ??
    dataUrlFromB64(record.bytes, mimeTypeFromRecord(record));

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

function modelFromRecord(
  record: ModelRecord,
  providerId: string,
  config: ProviderRuntimeConfig
): ImageModel | undefined {
  const id =
    stringFromUnknown(record.id) ??
    stringFromUnknown(record.model) ??
    stringFromUnknown(record.slug) ??
    stringFromUnknown(record.value) ??
    stringFromUnknown(record.name);
  if (!id) {
    return undefined;
  }

  const capabilities =
    overrideCapabilities(record, config.capabilityOverrides) ?? inferCapabilities(record);
  if (capabilities.length === 0) {
    return undefined;
  }

  return {
    id,
    name:
      stringFromUnknown(record.name) ??
      stringFromUnknown(record.display_name) ??
      stringFromUnknown(record.model_name) ??
      id,
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
  const images = asImageEntries(payload)
    .map((entry, index) => imageFromRecord(entry, index))
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
        .map((record) => modelFromRecord(record, providerId, config))
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
