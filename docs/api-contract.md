# API Contract

## Phase 8 Scope

Phase 8 defines provider configuration, connection testing, model discovery, text-to-image generation, reference image upload, image-to-image generation, and SQLite-backed server generation history.

## Provider Types

```ts
type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyRef: string;
  apiKeyPreview: string;
  providerType?: "auto" | "openai-compatible" | "image2-compatible";
  capabilityOverrides?: Array<{
    modelId: string;
    capabilities: Array<"text-to-image" | "image-to-image">;
  }>;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastTestStatus: "untested" | "success" | "failed";
};
```

`apiKeyRef` identifies the server-side in-memory key entry. `apiKeyPreview` is safe to show in the UI. The plaintext API Key is never returned by the API.

## REST Endpoints

```txt
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
DELETE /api/history/:id
DELETE /api/history
```

Create request:

```ts
type CreateProviderRequest = {
  name: string;
  baseUrl: string;
  apiKey: string;
  providerType?: "auto" | "openai-compatible" | "image2-compatible";
  capabilityOverrides?: Array<{
    modelId: string;
    capabilities: Array<"text-to-image" | "image-to-image">;
  }>;
};
```

Update request:

```ts
type UpdateProviderRequest = {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  providerType?: "auto" | "openai-compatible" | "image2-compatible";
  capabilityOverrides?: Array<{
    modelId: string;
    capabilities: Array<"text-to-image" | "image-to-image">;
  }>;
};
```

Connection test request:

```ts
type TestProviderRequest =
  | { providerId: string }
  | { baseUrl: string; apiKey: string };
```

Connection test response:

```ts
type ProviderTestResponse = {
  ok: boolean;
  message: string;
  testedAt: string;
  statusCode?: number;
};
```

## Model Types

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
```

`capabilities` must contain at least one image capability. Provider adapters may keep provider-specific fields in `raw`, but the public model list response does not require clients to consume raw provider data.

Model list request:

```ts
type ModelListRequest = {
  providerId: string;
};
```

Model list response:

```ts
type ModelListResponse = {
  models: ImageModel[];
  fetchedAt: string;
};
```

The client never sends or receives the plaintext API Key for model discovery. The server resolves `providerId` to a runtime config and calls the adapter.

## Generation Types

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

type GenerateImageResponse = {
  images: GeneratedImage[];
  generatedAt: string;
  historyRecord?: GenerationHistoryRecord;
};

type UploadImageResponse = {
  image: UploadedImageRef;
};
```

`POST /api/images/upload` accepts base64 data URLs for PNG, JPEG, and WebP images up to 5 MB. The response returns only metadata and an `id`; it does not echo uploaded image bytes.

`POST /api/images/generate` accepts `mode: "text-to-image"` or `mode: "image-to-image"`. Image-to-image requests must include `inputImageId` and `strength` between `0` and `1`.

## History Types

Generation history is a server feature backed by SQLite in the configured data directory. The browser imports old localStorage history through `POST /api/history/import` and no longer writes new history to localStorage.

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
```

History records must not contain plaintext API Keys, Authorization headers, provider runtime secrets, or uploaded reference image data URLs. Image-to-image records may keep reference image file metadata so users can identify which file to upload again.

History list response:

```ts
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

`GET /api/history` returns records ordered by newest first. `DELETE /api/history/:id` deletes a single item and associated generated local assets. `DELETE /api/history` clears all items and associated generated local assets.

## Errors

Errors use a shared shape:

```json
{
  "error": {
    "code": "PROVIDER_AUTH_FAILED",
    "message": "Provider rejected the API Key.",
    "detail": "Provider returned HTTP 401."
  }
}
```

API Keys and Authorization headers must not be included in `message` or `detail`.
