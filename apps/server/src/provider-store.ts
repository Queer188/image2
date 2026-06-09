import { randomUUID } from "node:crypto";
import type {
  CreateProviderRequest,
  ProviderConfig,
  ProviderRuntimeConfig,
  ProviderTestResponse,
  UpdateProviderRequest
} from "@image2/shared";
import { AppError, maskSecret } from "./errors.js";

type ProviderRecord = ProviderConfig;

const providers = new Map<string, ProviderRecord>();
const apiKeys = new Map<string, string>();

function normalizeProviderInput(value: CreateProviderRequest): CreateProviderRequest {
  return {
    name: value.name.trim(),
    baseUrl: value.baseUrl.trim(),
    apiKey: value.apiKey.trim()
  };
}

function assertCreateRequest(value: Partial<CreateProviderRequest>): asserts value is CreateProviderRequest {
  if (!value.name?.trim()) {
    throw new AppError("BAD_REQUEST", "Provider name is required.", 400);
  }

  if (!value.baseUrl?.trim()) {
    throw new AppError("BAD_REQUEST", "API Base URL is required.", 400);
  }

  if (!value.apiKey?.trim()) {
    throw new AppError("BAD_REQUEST", "API Key is required.", 400);
  }
}

export function listProviders(): ProviderConfig[] {
  return [...providers.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
}

export function createProvider(value: Partial<CreateProviderRequest>): ProviderConfig {
  assertCreateRequest(value);
  const input = normalizeProviderInput(value);
  const id = randomUUID();
  const apiKeyRef = randomUUID();
  const now = new Date().toISOString();

  apiKeys.set(apiKeyRef, input.apiKey);

  const provider: ProviderConfig = {
    id,
    name: input.name,
    baseUrl: input.baseUrl,
    apiKeyRef,
    apiKeyPreview: maskSecret(input.apiKey),
    createdAt: now,
    updatedAt: now,
    lastTestStatus: "untested"
  };

  providers.set(id, provider);
  return provider;
}

export function updateProvider(
  id: string,
  value: Partial<UpdateProviderRequest>
): ProviderConfig {
  const provider = providers.get(id);
  if (!provider) {
    throw new AppError("PROVIDER_NOT_FOUND", "Provider was not found.", 404);
  }

  const nextName = value.name === undefined ? provider.name : value.name.trim();
  const nextBaseUrl =
    value.baseUrl === undefined ? provider.baseUrl : value.baseUrl.trim();

  if (!nextName) {
    throw new AppError("BAD_REQUEST", "Provider name is required.", 400);
  }

  if (!nextBaseUrl) {
    throw new AppError("BAD_REQUEST", "API Base URL is required.", 400);
  }

  const now = new Date().toISOString();
  const nextProvider: ProviderConfig = {
    ...provider,
    name: nextName,
    baseUrl: nextBaseUrl,
    updatedAt: now
  };

  if (value.apiKey !== undefined) {
    const apiKey = value.apiKey.trim();
    if (!apiKey) {
      throw new AppError("BAD_REQUEST", "API Key cannot be blank.", 400);
    }

    apiKeys.set(provider.apiKeyRef, apiKey);
    nextProvider.apiKeyPreview = maskSecret(apiKey);
  }

  providers.set(id, nextProvider);
  return nextProvider;
}

export function deleteProvider(id: string): void {
  const provider = providers.get(id);
  if (!provider) {
    throw new AppError("PROVIDER_NOT_FOUND", "Provider was not found.", 404);
  }

  providers.delete(id);
  apiKeys.delete(provider.apiKeyRef);
}

export function getProviderRuntimeConfig(id: string): ProviderRuntimeConfig {
  const provider = providers.get(id);
  if (!provider) {
    throw new AppError("PROVIDER_NOT_FOUND", "Provider was not found.", 404);
  }

  const apiKey = apiKeys.get(provider.apiKeyRef);
  if (!apiKey) {
    throw new AppError("BAD_REQUEST", "Provider API key is not available.", 400);
  }

  return {
    baseUrl: provider.baseUrl,
    apiKey
  };
}

export function recordProviderTest(
  id: string,
  result: ProviderTestResponse
): void {
  const provider = providers.get(id);
  if (!provider) {
    return;
  }

  providers.set(id, {
    ...provider,
    lastTestedAt: result.testedAt,
    lastTestStatus: result.ok ? "success" : "failed",
    updatedAt: new Date().toISOString()
  });
}

export function clearProvidersForTests(): void {
  providers.clear();
  apiKeys.clear();
}
