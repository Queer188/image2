# API Contract

## Phase 1 Scope

Phase 1 defines provider configuration and connection testing only. Model discovery, image generation, uploads, and history are intentionally out of scope.

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
