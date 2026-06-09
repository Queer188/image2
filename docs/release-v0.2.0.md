# image2 v0.2.0 Release Notes

## New Features

- Local React/Fastify image generation workbench for custom providers.
- Provider configuration with Base URL, API Key, provider type, connection testing, edit, and delete.
- Model discovery with image-capable model filtering and capability overrides.
- Text-to-image generation with prompt, negative prompt, ratio, quality, count, and seed.
- Image-to-image generation with reference image upload, strength, prompt controls, ratio, quality, count, and seed.
- Result gallery with preview, download, and remote URL copy when a provider returns a URL.
- SQLite-backed local generation history with view, reuse, delete, and clear actions.
- Generated result asset retention for provider-returned inline image results.
- One-time migration of older browser history from `image2:generation-history:v1` into server history.
- Security controls for API Key redaction, upload limits, provider URL validation, CORS allowlist, and request timeouts.

## Migration Notes

- Run `npm install` after pulling v0.2.0.
- Copy `.env.example` to `.env` if you do not already have local environment config.
- Set `IMAGE2_DATA_DIR` before first launch if you want history and generated assets outside the repo-local `.image2-data` directory.
- Existing browser history under `image2:generation-history:v1` is imported on first app load after the server is reachable. The old key is removed only after import succeeds.
- Provider configs and API Keys from older in-memory sessions do not survive restart. Re-add providers after starting v0.2.0.
- Uploaded reference images from image-to-image flows are not migrated or retained. Reusing image-to-image history restores parameters and asks for a fresh reference upload.

## Security Notes

- v0.2.0 is a local single-user release. Public hosted deployment is not supported without additional hardening.
- API Keys remain in server memory only and are not stored in SQLite, browser storage, logs, or history responses.
- SQLite history may contain prompts, provider/model names, generated remote URLs, and generated local asset paths. It is not encrypted.
- Uploads are limited to PNG, JPEG, and WebP files up to 5 MB.
- Provider URLs are validated against protocol, localhost/private address, DNS, and redirect rules to reduce SSRF risk.
- Remote generated image URLs are stored as URLs only; the server does not fetch them in v0.2.0.
- Do not paste real API Keys, Authorization headers, uploaded image content, or inline image data into docs, issues, logs, or fixtures.

## Known Limitations

- Provider configs and API Keys are not durably persisted. Restarting the server clears them.
- Durable encrypted API Key storage is not implemented.
- Uploaded reference images are held in memory and are lost on restart.
- SQLite history is not encrypted.
- Generated asset cleanup is tied to history delete/clear. Quota-based cleanup is not implemented.
- Provider compatibility is best-effort across OpenAI-compatible and image2-compatible APIs; provider-specific private parameters are not generally supported.
- Long-running generation cannot cancel provider-side work after a request is sent.
- `node:sqlite` may print an experimental warning on some Node.js 22 builds. Use Node.js 22.5 or newer; the warning reflects Node's module status, not API Key storage.

## Verification Commands

```bash
npm install
npm run lint
npm test
npm run build
npm run check
```

Optional smoke test:

```bash
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173), add a provider, test the connection, refresh models, run a text-to-image generation, run an image-to-image generation, verify history reuse, and delete a history item.
