import type { ApiErrorCode } from "@image2/shared";

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

export function sanitizeErrorDetail(detail: string, secret?: string): string {
  if (!secret) {
    return detail;
  }

  return detail.split(secret).join("[redacted]");
}
