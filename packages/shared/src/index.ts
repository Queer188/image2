export type HealthStatus = {
  status: "ok";
  service: "image2-server";
};

export type ProviderConnectionState = "untested" | "success" | "failed";

export type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyRef: string;
  apiKeyPreview: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastTestStatus: ProviderConnectionState;
};

export type ProviderRuntimeConfig = {
  baseUrl: string;
  apiKey: string;
};

export type ImageModelCapability = "text-to-image" | "image-to-image";

export type ImageModel = {
  id: string;
  name: string;
  providerId: string;
  capabilities: ImageModelCapability[];
  supportedRatios?: string[];
  supportedQualities?: string[];
  raw?: unknown;
};

export type GenerateImageMode = "text-to-image" | "image-to-image";

export type GenerateImageRequest = {
  providerId: string;
  modelId: string;
  mode: GenerateImageMode;
  prompt: string;
  negativePrompt?: string;
  ratio?: string;
  quality?: "standard" | "hd" | "ultra" | string;
  count?: number;
  seed?: number;
  strength?: number;
  inputImageId?: string;
};

export type UploadImageRequest = {
  fileName?: string;
  mimeType: string;
  dataUrl: string;
};

export type UploadedImageRef = {
  id: string;
  fileName?: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  sizeBytes: number;
  uploadedAt: string;
};

export type GeneratedImage = {
  id: string;
  url?: string;
  localPath?: string;
  width?: number;
  height?: number;
  seed?: number;
  metadata: Record<string, unknown>;
};

export type GenerationHistoryInputImage = {
  fileName?: string;
  mimeType: UploadedImageRef["mimeType"];
  sizeBytes: number;
};

export type GenerationHistoryParameters = {
  mode: GenerateImageMode;
  prompt: string;
  negativePrompt?: string;
  ratio?: string;
  quality?: "standard" | "hd" | "ultra" | string;
  count?: number;
  seed?: number;
  strength?: number;
  inputImage?: GenerationHistoryInputImage;
};

export type GenerationHistoryRecord = {
  id: string;
  createdAt: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  parameters: GenerationHistoryParameters;
  images: GeneratedImage[];
};

export type CreateProviderRequest = {
  name: string;
  baseUrl: string;
  apiKey: string;
};

export type UpdateProviderRequest = {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
};

export type TestProviderRequest =
  | {
      providerId: string;
      baseUrl?: never;
      apiKey?: never;
    }
  | {
      providerId?: never;
      baseUrl: string;
      apiKey: string;
    };

export type ProviderListResponse = {
  providers: ProviderConfig[];
};

export type ProviderTestResponse = {
  ok: boolean;
  message: string;
  testedAt: string;
  statusCode?: number;
};

export type ModelListRequest = {
  providerId: string;
};

export type ModelListResponse = {
  models: ImageModel[];
  fetchedAt: string;
};

export type GenerateImageResponse = {
  images: GeneratedImage[];
  generatedAt: string;
};

export type UploadImageResponse = {
  image: UploadedImageRef;
};

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_CONNECTION_FAILED"
  | "PROVIDER_GENERATION_FAILED"
  | "PROVIDER_MODEL_LIST_FAILED"
  | "PROVIDER_URL_BLOCKED"
  | "INTERNAL_ERROR";

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
    detail?: string;
  };
};
