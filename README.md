# image2 Tool

image2 Tool is a local-first image generation workbench. Phase 4 supports API provider configuration, connection testing, model discovery, text-to-image generation, and image-to-image generation through a React web app and Fastify API server.

## Current Phase

Phase 4: image-to-image MVP.

Included:

- npm workspace layout for web, server, and shared packages
- Vite React frontend with a provider configuration form
- Fastify backend with `GET /health` and provider configuration APIs
- Shared package contracts for provider configuration and API errors
- Provider create, list, update, delete, and connection test endpoints
- Model list endpoint backed by a provider adapter
- Model picker with loading, refresh, empty, and error states
- Capability tags for image models, including `text-to-image` and `image-to-image`
- Text-to-image generation endpoint backed by the provider adapter
- Text-to-image form for model, prompt, negative prompt, ratio, quality, count, and seed
- Generation loading, success, and error states
- Result gallery with image preview and download links
- Reference image upload for image-to-image generation
- Upload validation for PNG, JPEG, and WebP files up to 5 MB
- Image-to-image form for model, prompt, negative prompt, strength, ratio, quality, count, and seed
- API Key redaction in responses and logs
- lint, test, build, and dev scripts

Not included yet:

- Complex history management

Provider data is stored in server memory for this phase. API Keys are not returned to the browser and are not written to durable storage in cleartext.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Getting Started

```bash
npm install
npm run dev
```

The web app runs on [http://localhost:5173](http://localhost:5173).
The server runs on [http://localhost:3001](http://localhost:3001).

## Scripts

```bash
npm run dev        # start web and server together
npm run dev:web    # start only the Vite web app
npm run dev:server # start only the Fastify API server
npm run lint       # run ESLint
npm test           # run package tests
npm run build      # build all packages
```

## Health Check

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "image2-server"
}
```

## Provider API

```bash
curl http://localhost:3001/api/providers
```

Create a provider:

```bash
curl -X POST http://localhost:3001/api/providers \
  -H "content-type: application/json" \
  -d '{"name":"Example","baseUrl":"https://api.example.com/v1","apiKey":"sk-..."}'
```

Test a provider before saving:

```bash
curl -X POST http://localhost:3001/api/providers/test \
  -H "content-type: application/json" \
  -d '{"baseUrl":"https://api.example.com/v1","apiKey":"sk-..."}'
```

The connection test sends a lightweight `GET` request to the configured base URL with a bearer token. It does not discover models or generate images.

## Model Discovery API

List image-capable models for a saved provider:

```bash
curl -X POST http://localhost:3001/api/models/list \
  -H "content-type: application/json" \
  -d '{"providerId":"provider-id"}'
```

Expected response:

```json
{
  "models": [
    {
      "id": "gpt-image-1",
      "name": "GPT Image",
      "providerId": "provider-id",
      "capabilities": ["text-to-image"]
    }
  ],
  "fetchedAt": "2026-06-09T00:00:00.000Z"
}
```

The browser sends only the saved `providerId`. The server reads the API Key from its in-memory provider store, calls the provider's common `/models` endpoint, normalizes OpenAI-compatible `data` responses and image2-compatible `models` responses, and filters for image-capable models.

## Text-to-Image API

Generate images with a saved provider and model:

```bash
curl -X POST http://localhost:3001/api/images/generate \
  -H "content-type: application/json" \
  -d '{
    "providerId":"provider-id",
    "modelId":"gpt-image-1",
    "mode":"text-to-image",
    "prompt":"A quiet studio desk",
    "negativePrompt":"blur",
    "ratio":"1:1",
    "quality":"hd",
    "count":1,
    "seed":42
  }'
```

Expected response:

```json
{
  "images": [
    {
      "id": "image-id",
      "url": "https://cdn.example.com/image.png",
      "width": 1024,
      "height": 1024,
      "metadata": {
        "index": 0
      }
    }
  ],
  "generatedAt": "2026-06-09T00:00:00.000Z"
}
```

The browser still sends only the saved `providerId`, selected model, and generation parameters. The API Key is resolved server-side and is not returned in responses.

## Image-to-Image API

Upload a PNG, JPEG, or WebP reference image before generating:

```bash
curl -X POST http://localhost:3001/api/images/upload \
  -H "content-type: application/json" \
  -d '{
    "fileName":"reference.png",
    "mimeType":"image/png",
    "dataUrl":"data:image/png;base64,..."
  }'
```

Expected response:

```json
{
  "image": {
    "id": "upload-id",
    "fileName": "reference.png",
    "mimeType": "image/png",
    "sizeBytes": 1024,
    "uploadedAt": "2026-06-09T00:00:00.000Z"
  }
}
```

The upload response does not return the image bytes. Generate from the uploaded image id:

```bash
curl -X POST http://localhost:3001/api/images/generate \
  -H "content-type: application/json" \
  -d '{
    "providerId":"provider-id",
    "modelId":"image-edit-pro",
    "mode":"image-to-image",
    "prompt":"Keep the composition and change the material",
    "negativePrompt":"blur",
    "inputImageId":"upload-id",
    "strength":0.6,
    "ratio":"1:1",
    "quality":"standard",
    "count":1,
    "seed":42
  }'
```

The server resolves the API Key and uploaded image server-side. image2-compatible providers receive a JSON payload with common `image` / `input_image` fields. If that endpoint is unavailable, the adapter falls back to OpenAI-compatible multipart `images/edits` requests.
