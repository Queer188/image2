# Development

## Workspace Layout

```txt
apps/
  web/      Vite React frontend
  server/   Fastify backend
packages/
  shared/   Shared TypeScript contracts
```

## Local Development

Use Node.js 22.5 or newer because the server history store uses the built-in `node:sqlite` module.

Run both apps:

```bash
npm run dev
```

Run checks:

```bash
npm run lint
npm test
npm run build
```

## Phase 8 Notes

- The web app proxies `/api` and `/health` to the local Fastify server during Vite development.
- Provider configuration is stored in server memory. Restarting the server clears providers and API keys.
- Plaintext API keys are accepted only in create, update, and test request bodies. They are not returned to the browser.
- `IMAGE2_DATA_DIR` controls the local data directory. If unset, the server uses `.image2-data` under the current working directory.
- The server initializes `image2.sqlite` in the data directory and runs idempotent migrations at first history access.
- Connection testing performs a lightweight request to the configured base URL.
- Model discovery calls `POST /api/models/list` with a saved `providerId`.
- The provider adapter calls the provider's common `/models` endpoint and supports OpenAI-compatible `data`, image2-compatible `models`, and generic `items` arrays.
- Models without detected image capabilities are filtered from the UI response.
- Text-to-image generation calls `POST /api/images/generate` with a saved `providerId`, selected model, prompt, negative prompt, ratio, quality, count, and optional seed.
- Reference image upload calls `POST /api/images/upload` with a PNG, JPEG, or WebP data URL up to 5 MB.
- Upload responses return only metadata and an image id; uploaded bytes are held in server memory.
- Image-to-image generation calls `POST /api/images/generate` with `mode: "image-to-image"`, `inputImageId`, prompt, negative prompt, strength, ratio, quality, count, and optional seed.
- The provider adapter posts text-to-image requests to the provider's common `/images/generations` endpoint.
- Image-to-image requests first use image2-compatible JSON at `/images/generations` and fall back to OpenAI-compatible multipart `/images/edits` when JSON edits are unavailable.
- OpenAI-compatible `data` responses and image2-compatible `images` responses are normalized to shared `GeneratedImage` objects.
- Successful generation responses are saved in SQLite through the server history store.
- History keeps generated image metadata/URLs, generated local asset paths, and reusable generation parameters.
- History does not store plaintext API Keys, Authorization headers, provider runtime configs, uploaded reference image bytes, or uploaded reference image data URLs.
- Provider-returned generated `data:image/...` URLs are saved as generated result files below `IMAGE2_DATA_DIR/assets/generated/YYYY/MM/` using internal ids as filenames.
- Remote generated image URLs are stored as URLs only; the server does not fetch remote result URLs in this phase.
- The browser no longer writes new generation history to `localStorage`.
- Existing browser history under `image2:generation-history:v1` is imported through `POST /api/history/import` on first load, then the old key is removed after a successful import.
- If server history cannot be loaded, the UI can temporarily show existing browser history as a fallback without deleting it.
- Reusing image-to-image history restores the parameters and clears the current uploaded input so the user uploads the reference image again.
- `GET /api/history` lists records, `DELETE /api/history/:id` deletes one record, and `DELETE /api/history` clears all history.
- Provider Base URLs are validated before save and before outbound provider calls.
- Local provider URLs are controlled by `ALLOW_LOCAL_PROVIDER_URLS`.
- Direct browser API access is controlled by the `CORS_ORIGIN` allowlist.
- Run `npm run check` before release to execute lint, tests, and build.
