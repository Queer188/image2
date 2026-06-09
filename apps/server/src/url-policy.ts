import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "./errors.js";

const LOCAL_HOSTNAMES = new Set(["localhost"]);

function envFlag(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function localProviderUrlsAllowed(): boolean {
  return envFlag(process.env.ALLOW_LOCAL_PROVIDER_URLS) ?? process.env.NODE_ENV !== "production";
}

function trustedProviderOrigins(): Set<string> {
  const configured = process.env.TRUSTED_PROVIDER_ORIGINS;
  const origins = new Set<string>();
  if (!configured) {
    return origins;
  }

  for (const entry of configured.split(",")) {
    const value = entry.trim();
    if (!value || value.includes("*")) {
      continue;
    }

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      continue;
    }

    if (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.origin === value
    ) {
      origins.add(parsed.origin);
    }
  }

  return origins;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) {
    return isPrivateIpv4(mappedIpv4[1]);
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("ff")
  );
}

function isLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    LOCAL_HOSTNAMES.has(normalized) ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

function isPrivateAddress(address: string): boolean {
  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    return isPrivateIpv4(address);
  }

  if (ipVersion === 6) {
    return isPrivateIpv6(address);
  }

  return false;
}

export async function assertSafeProviderUrl(baseUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new AppError("BAD_REQUEST", "API Base URL must be a valid URL.", 400);
  }

  const allowLocal = localProviderUrlsAllowed();
  const hostname = parsed.hostname;
  const trustedOrigin = trustedProviderOrigins().has(parsed.origin);

  if (isLocalHost(hostname) && !allowLocal) {
    throw new AppError(
      "PROVIDER_URL_BLOCKED",
      "Provider URL cannot target localhost in production.",
      400
    );
  }

  if (parsed.protocol === "http:" && !(allowLocal && isLocalHost(hostname))) {
    throw new AppError(
      "PROVIDER_URL_BLOCKED",
      "Only HTTPS provider URLs are allowed.",
      400
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AppError(
      "PROVIDER_URL_BLOCKED",
      "Provider URL must use HTTP or HTTPS.",
      400
    );
  }

  if (
    isIP(hostname) &&
    isPrivateAddress(hostname) &&
    !trustedOrigin &&
    !(allowLocal && isLocalHost(hostname))
  ) {
    throw new AppError(
      "PROVIDER_URL_BLOCKED",
      "Provider URL cannot target private network addresses.",
      400
    );
  }

  if (!isIP(hostname) && !isLocalHost(hostname)) {
    try {
      const records = await lookup(hostname, { all: true });
      if (!trustedOrigin && records.some((record) => isPrivateAddress(record.address))) {
        throw new AppError(
          "PROVIDER_URL_BLOCKED",
          "Provider URL cannot resolve to private network addresses.",
          400
        );
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        "PROVIDER_URL_BLOCKED",
        "Provider URL hostname could not be verified.",
        400
      );
    }
  }

  return parsed;
}
