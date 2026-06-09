import type { ProviderRuntimeConfig, ProviderTestResponse } from "@image2/shared";
import { AppError, sanitizeErrorDetail } from "./errors.js";
import { assertSafeProviderUrl } from "./url-policy.js";

const DEFAULT_TIMEOUT_MS = 5_000;

export async function testProviderConnection(
  config: ProviderRuntimeConfig
): Promise<ProviderTestResponse> {
  const url = await assertSafeProviderUrl(config.baseUrl);
  const testedAt = new Date().toISOString();
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

    if (response.status === 401 || response.status === 403) {
      throw new AppError(
        "PROVIDER_AUTH_FAILED",
        "Provider rejected the API Key.",
        401,
        `Provider returned HTTP ${response.status}.`
      );
    }

    if (response.status >= 500) {
      throw new AppError(
        "PROVIDER_CONNECTION_FAILED",
        "Provider is reachable but returned a server error.",
        502,
        `Provider returned HTTP ${response.status}.`
      );
    }

    return {
      ok: true,
      message: "Provider is reachable and did not reject the API Key.",
      testedAt,
      statusCode: response.status
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const detail =
      error instanceof Error
        ? sanitizeErrorDetail(error.message, config.apiKey)
        : "Connection failed.";

    throw new AppError(
      "PROVIDER_CONNECTION_FAILED",
      "Unable to connect to provider.",
      502,
      detail
    );
  } finally {
    clearTimeout(timeout);
  }
}
