# Development

## Workspace Layout

```txt
apps/
  web/      Vite React frontend
  server/   Fastify backend
packages/
  shared/   Shared TypeScript contracts
```

## Requirements

- Node.js 22.5 or newer
- npm 10 or newer

The server history store uses the built-in `node:sqlite` module. If Node.js prints an experimental warning for `node:sqlite`, treat it as an upstream Node.js module-status warning. It does not change image2 storage behavior. Use a current Node.js 22.x release or newer for v0.3 development and release checks.

## Local Setup

```bash
npm install
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

`npm run dev` automatically loads `.env` before starting the web and server processes. Shell/process environment variables take precedence over `.env` values when both are set.

## Scripts

```bash
npm run dev        # run web and server together
npm run dev:raw    # run web and server without loading .env
npm run dev:web    # run Vite only
npm run dev:server # run Fastify only
npm run lint       # run ESLint
npm test           # run workspace tests
npm run build      # build shared, server, and web
npm run check      # release gate: lint, tests, build
```

## Runtime Notes

- Vite proxies `/api` and `/health` to the local Fastify server during development.
- Provider configuration is stored in server memory. Restarting the server clears providers and API Keys.
- Plaintext API Keys are accepted only in create, update, and test request bodies. They are not returned to the browser.
- Providers carry `providerType`: `auto`, `openai-compatible`, or `image2-compatible`.
- `capabilityOverrides` can be stored with a provider when the remote `/models` response mislabels or omits image capabilities.
- `IMAGE2_DATA_DIR` controls the local data directory. If unset, the server uses `.image2-data` under the current working directory.
- `NODE_ENV=production` disables permissive development defaults such as local provider URLs unless explicitly configured.
- The server initializes `image2.sqlite` in the data directory and runs idempotent migrations at first history access.
- Direct browser API access is controlled by the `CORS_ORIGIN` allowlist.
- Local provider URLs are controlled by `ALLOW_LOCAL_PROVIDER_URLS`.
- `TRUSTED_PROVIDER_ORIGINS` accepts exact `http`/`https` origins only. Use it only for known provider origins that intentionally resolve to private or reserved addresses; do not include paths, wildcards, or network ranges.

## Generation Flow

- Connection testing performs a lightweight request to the configured provider Base URL.
- Model discovery calls `POST /api/models/list` with a saved `providerId`.
- The provider adapter calls the provider `/models` endpoint and supports OpenAI-compatible `data`, image2-compatible `models`, generic `items`, and several nested list aliases.
- Models without detected image capabilities are filtered from the UI response.
- Text-to-image generation calls `POST /api/images/generate` with a saved `providerId`, selected model, prompt, negative prompt, ratio, quality, count, and optional seed.
- Reference image upload calls `POST /api/images/upload` with a PNG, JPEG, or WebP image up to 5 MB.
- Upload responses return only metadata and an image id; uploaded bytes are held in server memory.
- Image-to-image generation calls `POST /api/images/generate` with `mode: "image-to-image"`, `inputImageId`, prompt, negative prompt, strength, ratio, quality, count, and optional seed.
- Successful generation responses are saved in SQLite through the server history store.

## History And Assets

- History keeps generated image metadata/URLs, generated local asset paths, and reusable generation parameters.
- History does not store plaintext API Keys, Authorization headers, provider runtime configs, uploaded reference image bytes, or uploaded reference image data.
- Provider-returned generated inline image results are saved as generated result files below `IMAGE2_DATA_DIR/assets/generated/YYYY/MM/` using internal ids as filenames.
- Remote generated image URLs are stored as URLs only; the server does not fetch remote result URLs in v0.2.
- The browser no longer writes new generation history to `localStorage`.
- Existing browser history under `image2:generation-history:v1` is imported through `POST /api/history/import` on first load, then the old key is removed after a successful import.
- If server history cannot be loaded, the UI can temporarily show existing browser history as a fallback without deleting it.
- Reusing image-to-image history restores parameters and clears the current uploaded input so the user uploads the reference image again.

## Release Checklist

1. Confirm `.env.example` documents every runtime environment variable.
2. Search docs and code changes for real API Keys, Authorization headers, uploaded image content, and inline image data.
3. Run `npm run check`.
4. Update `docs/release-v0.3.0.md` if behavior changed.
5. Commit with `chore: verify and prepare v0.3.0 release`.
