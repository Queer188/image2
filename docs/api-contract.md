# API Contract

## Phase 3 Scope

Phase 3 defines provider configuration, connection testing, model discovery, and text-to-image generation. Image-to-image, uploads, and history are intentionally out of scope.

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
```

Phase 3 only accepts `mode: "text-to-image"` at `POST /api/images/generate`. `image-to-image` fields are reserved for Phase 4.

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
