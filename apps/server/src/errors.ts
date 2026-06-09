import type { ApiErrorCode } from "@image2/shared";

const MAX_PUBLIC_ERROR_DETAIL_LENGTH = 500;

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly detail?: string;

  constructor(
    code: ApiErrorCode,
    message: string,
    statusCode: number,
    detail?: string
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

export function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "****";
  }

  return `${value.slice(0, 3)}...${value.slice(-4)}`;
}

function redactCommonSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(authorization["'\s:=]+)([A-Za-z0-9._~+/=-]+)/gi, "$1[redacted]")
    .replace(/((?:api[_-]?key|apikey|token|secret)["'\s:=]+)([A-Za-z0-9._~+/=-]+)/gi, "$1[redacted]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]")
    .replace(/data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+/gi, "data:image/[redacted];base64,[redacted]");
}

export function sanitizeErrorDetail(detail: string, secret?: string): string {
  const withoutKnownSecret = secret
    ? detail.split(secret).join("[redacted]")
    : detail;
  const redacted = redactCommonSecrets(withoutKnownSecret)
    .replace(/\s+/g, " ")
    .trim();

  if (redacted.length <= MAX_PUBLIC_ERROR_DETAIL_LENGTH) {
    return redacted;
  }

  return `${redacted.slice(0, MAX_PUBLIC_ERROR_DETAIL_LENGTH)}...`;
}
