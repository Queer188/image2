import type {
  ImageModel,
  ImageModelCapability,
  ProviderRuntimeConfig
} from "@image2/shared";
import { AppError, sanitizeErrorDetail } from "../errors.js";
import { assertSafeProviderUrl } from "../url-policy.js";
import type { ImageProviderAdapter } from "./base.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const MODEL_DETAIL_LIMIT = 240;
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

function endpointFromBaseUrl(baseUrl: string): Promise<URL> {
  return assertSafeProviderUrl(baseUrl).then((url) => {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[segments.length - 1] !== "models") {
      segments.push("models");
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

export const openAiCompatibleAdapter: ImageProviderAdapter = {
  async testConnection() {
    return;
  },

  async listModels(
    config: ProviderRuntimeConfig,
    providerId: string
  ): Promise<ImageModel[]> {
    const url = await endpointFromBaseUrl(config.baseUrl);
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
  }
};
