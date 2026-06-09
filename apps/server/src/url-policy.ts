import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "./errors.js";

const LOCAL_HOSTNAMES = new Set(["localhost"]);

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 0
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
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

  const allowLocal = process.env.NODE_ENV !== "production";
  const hostname = parsed.hostname;

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

  if (isIP(hostname) && isPrivateAddress(hostname) && !(allowLocal && isLocalHost(hostname))) {
    throw new AppError(
      "PROVIDER_URL_BLOCKED",
      "Provider URL cannot target private network addresses.",
      400
    );
  }

  if (!isIP(hostname) && !isLocalHost(hostname)) {
    try {
      const records = await lookup(hostname, { all: true });
      if (records.some((record) => isPrivateAddress(record.address))) {
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
    }
  }

  return parsed;
}
