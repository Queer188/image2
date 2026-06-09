import { randomUUID } from "node:crypto";
import type {
  UploadedImageRef,
  UploadImageRequest,
  UploadImageResponse
} from "@image2/shared";
import { AppError } from "./errors.js";

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp"
] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_BODY_BYTES = Math.ceil(MAX_UPLOAD_BYTES * 1.5) + 1024;

export type UploadedImageMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export type StoredUploadedImage = UploadedImageRef & {
  dataUrl: string;
};

const uploadedImages = new Map<string, StoredUploadedImage>();

function isAllowedMimeType(value: string): value is UploadedImageMimeType {
  return ALLOWED_UPLOAD_MIME_TYPES.includes(value as UploadedImageMimeType);
}

function parseDataUrl(dataUrl: string): {
  mimeType: UploadedImageMimeType;
  base64: string;
} {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match) {
    throw new AppError(
      "BAD_REQUEST",
      "Upload must be a base64 PNG, JPEG, or WebP data URL.",
      400
    );
  }

  const mimeType = match[1].toLowerCase();
  if (!isAllowedMimeType(mimeType)) {
    throw new AppError(
      "BAD_REQUEST",
      "Only PNG, JPEG, and WebP uploads are supported.",
      400
    );
  }

  return {
    mimeType,
    base64: match[2].replace(/\s+/g, "")
  };
}

function byteLengthFromBase64(base64: string): number {
  return Buffer.from(base64, "base64").byteLength;
}

function publicImage(image: StoredUploadedImage): UploadedImageRef {
  return {
    id: image.id,
    fileName: image.fileName,
    mimeType: image.mimeType,
    sizeBytes: image.sizeBytes,
    uploadedAt: image.uploadedAt
  };
}

export function saveUploadedImage(
  value: Partial<UploadImageRequest>
): UploadImageResponse {
  if (!value.mimeType?.trim()) {
    throw new AppError("BAD_REQUEST", "Upload MIME type is required.", 400);
  }

  if (!value.dataUrl?.trim()) {
    throw new AppError("BAD_REQUEST", "Upload image data is required.", 400);
  }

  const { mimeType, base64 } = parseDataUrl(value.dataUrl.trim());
  const declaredMimeType = value.mimeType.trim().toLowerCase();
  if (declaredMimeType !== mimeType) {
    throw new AppError(
      "BAD_REQUEST",
      "Upload MIME type does not match the image data.",
      400
    );
  }

  const sizeBytes = byteLengthFromBase64(base64);
  if (sizeBytes < 1) {
    throw new AppError("BAD_REQUEST", "Upload image is empty.", 400);
  }

  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new AppError(
      "BAD_REQUEST",
      `Upload image must be ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB or smaller.`,
      400
    );
  }

  const image: StoredUploadedImage = {
    id: randomUUID(),
    fileName: value.fileName?.trim() || undefined,
    mimeType,
    sizeBytes,
    uploadedAt: new Date().toISOString(),
    dataUrl: `data:${mimeType};base64,${base64}`
  };

  uploadedImages.set(image.id, image);
  return {
    image: publicImage(image)
  };
}

export function getUploadedImage(id: string): StoredUploadedImage {
  const image = uploadedImages.get(id);
  if (!image) {
    throw new AppError("BAD_REQUEST", "Uploaded input image was not found.", 400);
  }

  return image;
}

export function clearUploadedImagesForTests(): void {
  uploadedImages.clear();
}
