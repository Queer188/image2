# API Contract

## Phase 4 Scope

Phase 4 defines provider configuration, connection testing, model discovery, text-to-image generation, reference image upload, and image-to-image generation. Complex history is intentionally out of scope.

## Provider Types

```ts
type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyRef: string;
  apiKeyPreview: string;
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
```

Create request:

```ts
type CreateProviderRequest = {
  name: string;
  baseUrl: string;
  apiKey: string;
};
```

Update request:

```ts
type UpdateProviderRequest = {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
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
};

type UploadImageResponse = {
  image: UploadedImageRef;
};
```

`POST /api/images/upload` accepts base64 data URLs for PNG, JPEG, and WebP images up to 5 MB. The response returns only metadata and an `id`; it does not echo uploaded image bytes.

`POST /api/images/generate` accepts `mode: "text-to-image"` or `mode: "image-to-image"`. Image-to-image requests must include `inputImageId` and `strength` between `0` and `1`.

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
