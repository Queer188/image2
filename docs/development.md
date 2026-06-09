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

## Phase 5 Notes

- The web app proxies `/api` and `/health` to the local Fastify server during Vite development.
- Provider configuration is stored in server memory. Restarting the server clears providers and API keys.
- Plaintext API keys are accepted only in create, update, and test request bodies. They are not returned to the browser.
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
- Successful generation responses are saved in browser `localStorage` under `image2:generation-history:v1`.
- Local history keeps generated image metadata/URLs and reusable generation parameters.
- Local history does not store plaintext API Keys, Authorization headers, or uploaded reference image data URLs.
- Reusing image-to-image history restores the parameters and clears the current uploaded input so the user uploads the reference image again.
