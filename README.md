# image2 Tool

image2 Tool is a local-first image generation workbench for custom API providers. v0.2 lets a user configure a provider Base URL and API Key, discover image-capable models, run text-to-image and image-to-image generation, save successful generations to local SQLite history, and download or reuse generated results.

The app is a React/Vite web client backed by a Fastify API server. The browser never calls third-party providers directly; it sends provider ids and generation parameters to the local server, and the server resolves the API Key in memory.

## v0.2 Status

Included:

- Provider configuration, edit, delete, and connection testing
- Provider type selection: `auto`, `openai-compatible`, and `image2-compatible`
- Model discovery with image capability filtering and capability overrides
- Text-to-image generation with prompt, negative prompt, ratio, quality, count, and seed
- Image-to-image generation with PNG/JPEG/WebP upload, strength, ratio, quality, count, and seed
- Result gallery with preview, download, and copy URL actions
- SQLite-backed generation history with reuse, delete, clear, and generated data URL asset retention
- One-time import of older browser `localStorage` history
- API Key redaction, upload limits, provider URL SSRF checks, CORS allowlist, and provider request timeouts

Not included:

- Account sync, team usage, billing, or cloud history
- Durable encrypted API Key storage
- Long-term storage for uploaded reference image binaries
- Public hosted deployment hardening

Provider metadata and API Keys are still stored in server memory in v0.2. Restarting the server clears saved providers and keys. Generation history is durable in local SQLite under `IMAGE2_DATA_DIR`.

## Requirements

- Node.js 22.5 or newer
- npm 10 or newer

The server uses the built-in `node:sqlite` module. Some Node.js 22 builds may print an experimental warning for `node:sqlite`; that warning means Node marks the module as experimental, not that image2 has fallen back to an unsafe storage mode. Use a current Node.js 22.x release or newer and run `npm run check` before release.

## Install

```bash
npm install
```

Create local environment config:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

The server reads environment variables from the process environment. This repo does not automatically load `.env`; use your shell, process manager, or local tooling to load it before starting the server.

## Environment Variables

`.env.example` contains the release template:

```txt
HOST=127.0.0.1
PORT=3001
NODE_ENV=development
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
ALLOW_LOCAL_PROVIDER_URLS=true
IMAGE2_DATA_DIR=.image2-data
```

- `HOST`: server bind address. Keep `127.0.0.1` for local use.
- `PORT`: Fastify API port.
- `NODE_ENV`: runtime mode. Production disables permissive defaults such as local provider URLs unless explicitly configured.
- `LOG_LEVEL`: Fastify logger level.
- `CORS_ORIGIN`: comma-separated browser origins allowed to call the API directly.
- `ALLOW_LOCAL_PROVIDER_URLS`: allows `http://localhost` providers for local development. Keep false in production-like deployments.
- `IMAGE2_DATA_DIR`: local SQLite database and generated result asset directory.

## Start

Run web and server together:

```bash
npm run dev
```

Run separately:

```bash
npm run dev:web
npm run dev:server
```

Default local URLs:

- Web app: [http://localhost:5173](http://localhost:5173)
- API server: [http://localhost:3001](http://localhost:3001)
- Health check: [http://localhost:3001/health](http://localhost:3001/health)

Release gate:

```bash
npm run check
```

## Provider Configuration

1. Open the web app.
2. Add a provider name, API Base URL, API Key, and provider type.
3. Use `Test connection` to verify the Base URL and key are accepted.
4. Save the provider.
5. Refresh models and select an image-capable model.

Provider type behavior:

- `auto`: image2-compatible JSON first where relevant, with OpenAI-compatible fallback for image edits.
- `openai-compatible`: uses OpenAI-style `/models`, `/images/generations`, and multipart `/images/edits`.
- `image2-compatible`: prefers image2 JSON generation and keeps OpenAI multipart fallback.

Use capability overrides when a provider returns models without image capability metadata:

```json
[
  { "modelId": "image-edit-pro", "capabilities": ["image-to-image"] },
  { "modelId": "gpt-image-1", "capabilities": ["text-to-image"] }
]
```

Never paste real API Keys into docs, issue comments, or logs. The app stores the plaintext key only in the running server process.

## Image Generation

Text-to-image requires a saved provider, a text-capable model, and a prompt. Optional controls include negative prompt, ratio, quality, count, and seed.

Image-to-image additionally requires a reference image upload. Uploads are limited to PNG, JPEG, and WebP files up to 5 MB. Uploaded reference bytes stay in server memory and are lost on restart.

Successful generations are saved to SQLite history. If a provider returns generated images as inline image data, the server writes generated result files under:

```txt
IMAGE2_DATA_DIR/assets/generated/YYYY/MM/
```

Remote generated image URLs are stored as URLs only; v0.2 does not fetch remote result URLs.

## API Summary

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

See [docs/api-contract.md](docs/api-contract.md) and [docs/provider-guide.md](docs/provider-guide.md) for request and adapter details.

## FAQ

### Why did my provider URL get blocked?

Provider URLs must be HTTPS unless `ALLOW_LOCAL_PROVIDER_URLS=true` and the URL targets localhost. Private network, link-local, multicast, reserved, and DNS-unverified hostnames are blocked to reduce SSRF risk.

### Why did my provider disappear after restart?

v0.2 keeps provider metadata and API Keys in server memory. Restarting the server clears them. Durable encrypted provider storage is a future phase.

### Is history encrypted?

No. History is stored in local SQLite. It may include prompts, provider/model names, generated image URLs, and generated local asset paths. It must not include API Keys, Authorization headers, uploaded reference bytes, or uploaded reference image data.

### Why are no models shown?

The provider may not expose image capability metadata. Check provider type, refresh models, then add capability overrides for known image models if needed.

### Can I deploy this publicly?

v0.2 is designed as a local single-user tool. A public deployment needs additional hardening: HTTPS, strict `CORS_ORIGIN`, `ALLOW_LOCAL_PROVIDER_URLS=false`, authentication, durable secret storage, rate limiting, and a fresh security review.

### What should I back up?

Back up `IMAGE2_DATA_DIR` if you want to keep generation history and generated result assets. API Keys are not stored there in v0.2.

## More Docs

- [Development](docs/development.md)
- [API contract](docs/api-contract.md)
- [Provider guide](docs/provider-guide.md)
- [Security review](docs/security-review.md)
- [v0.2.0 release notes](docs/release-v0.2.0.md)
