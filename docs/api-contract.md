# API Contract

## v0.2 Scope

v0.2 defines provider configuration, connection testing, model discovery, text-to-image generation, reference image upload, image-to-image generation, SQLite-backed generation history, generated local asset serving, and old browser history import.

The browser never receives plaintext API Keys from these APIs.

## REST Endpoints

```txt
GET    /health
GET    /api/providers
POST   /api/providers
PUT    /api/providers/:id
DELETE /api/providers/:id
POST   /api/providers/test
POST   /api/models/list
POST   /api/images/upload
POST   /api/images/generate
GET    /api/history
POST   /api/history/import
GET    /api/history/images/:id/file
DELETE /api/history/:id
DELETE /api/history
```

## Health

```ts
type HealthStatus = {
  status: "ok";
  service: "image2-server";
};
```

## Providers

```ts
type ProviderConnectionState = "untested" | "success" | "failed";

type ProviderType = "auto" | "openai-compatible" | "image2-compatible";

type ProviderCapabilityOverride = {
  modelId: string;
  capabilities: Array<"text-to-image" | "image-to-image">;
};

type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyRef: string;
  apiKeyPreview: string;
  providerType?: ProviderType;
  capabilityOverrides?: ProviderCapabilityOverride[];
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastTestStatus: ProviderConnectionState;
};
```

`apiKeyRef` identifies the server-side key entry. `apiKeyPreview` is safe to show in the UI. The plaintext API Key is never returned.

```ts
type CreateProviderRequest = {
  name: string;
  baseUrl: string;
  apiKey: string;
  providerType?: ProviderType;
  capabilityOverrides?: ProviderCapabilityOverride[];
};

type UpdateProviderRequest = {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  providerType?: ProviderType;
  capabilityOverrides?: ProviderCapabilityOverride[];
};

type TestProviderRequest =
  | { providerId: string }
  | { baseUrl: string; apiKey: string };

type ProviderListResponse = {
  providers: ProviderConfig[];
};

type ProviderTestResponse = {
  ok: boolean;
  message: string;
  testedAt: string;
  statusCode?: number;
};
```

Provider create/update validates Base URL safety before persisting. Provider delete also deletes the in-memory API Key entry.

## Models

```ts
type ImageModelCapability = "text-to-image" | "image-to-image";

type ImageModel = {
  id: string;
  name: string;
  providerId: string;
  capabilities: ImageModelCapability[];
  supportedRatios?: string[];
  supportedQualities?: string[];
  raw?: unknown;
};

type ModelListRequest = {
  providerId: string;
};

type ModelListResponse = {
  models: ImageModel[];
  fetchedAt: string;
};
```

The server resolves `providerId` to a runtime provider config and calls the selected adapter. Public model responses omit adapter-only raw fields.

## Uploads And Generation

```ts
type GenerateImageMode = "text-to-image" | "image-to-image";

type GenerateImageRequest = {
  providerId: string;
  modelId: string;
  modelName?: string;
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

type UploadImageRequest = {
  fileName?: string;
  mimeType: string;
  dataUrl: string;
};

type UploadedImageRef = {
  id: string;
  fileName?: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  sizeBytes: number;
  uploadedAt: string;
};

type GeneratedImage = {
  id: string;
  url?: string;
  localPath?: string;
  width?: number;
  height?: number;
  seed?: number;
  metadata: Record<string, unknown>;
};

type UploadImageResponse = {
  image: UploadedImageRef;
};

type GenerateImageResponse = {
  images: GeneratedImage[];
  generatedAt: string;
  historyRecord?: GenerationHistoryRecord;
};
```

`POST /api/images/upload` accepts PNG, JPEG, and WebP image data up to 5 MB. The response returns only metadata and an upload id; it does not echo uploaded bytes.

`POST /api/images/generate` accepts `mode: "text-to-image"` or `mode: "image-to-image"`. Image-to-image requests must include `inputImageId` and a `strength` value between `0` and `1`.

`count` must be an integer from 1 through 4. `seed`, when present, must be an integer.

## History

Generation history is backed by SQLite in `IMAGE2_DATA_DIR`. The browser imports old `localStorage` history through `POST /api/history/import` and no longer writes new history to `localStorage`.

```ts
type GenerationHistoryInputImage = {
  fileName?: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  sizeBytes: number;
};

type GenerationHistoryParameters = {
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

type GenerationHistoryRecord = {
  id: string;
  createdAt: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  parameters: GenerationHistoryParameters;
  images: GeneratedImage[];
};

type HistoryListResponse = {
  records: GenerationHistoryRecord[];
};

type ImportHistoryRequest = {
  records: GenerationHistoryRecord[];
};

type ImportHistoryResponse = {
  imported: number;
  records: GenerationHistoryRecord[];
};
```

History records must not contain plaintext API Keys, Authorization headers, provider runtime secrets, uploaded reference bytes, or uploaded reference image data. Image-to-image records may keep reference image file metadata so users can identify which file to upload again.

`GET /api/history` returns records ordered by newest first. `DELETE /api/history/:id` deletes a single item and associated generated local assets. `DELETE /api/history` clears all items and associated generated local assets.

`GET /api/history/images/:id/file` streams a generated local asset by image id after checking the asset path is still inside `IMAGE2_DATA_DIR`.

## Errors

```ts
type ApiErrorCode =
  | "BAD_REQUEST"
  | "HISTORY_NOT_FOUND"
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_CONNECTION_FAILED"
  | "PROVIDER_GENERATION_FAILED"
  | "PROVIDER_MODEL_LIST_FAILED"
  | "PROVIDER_URL_BLOCKED"
  | "INTERNAL_ERROR";

type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
    detail?: string;
  };
};
```

API Keys, Authorization headers, uploaded image data, and provider runtime secrets must not appear in `message` or `detail`.
