# Security Review

## Phase 8 Persistent History Review

Status: ready for local MVP release after `npm run check` passes.

This review covers the current React frontend, Fastify API server, provider adapters, upload handling, SQLite-backed generation history, and generated result asset storage.

## Findings And Controls

### API Keys

- Plaintext API Keys are accepted only by provider create, update, and connection-test requests.
- Plaintext API Keys are stored only in the server process memory map.
- Provider list/create/update responses return `apiKeyRef` and masked `apiKeyPreview`, never plaintext keys.
- Provider type selection and capability overrides are saved as non-secret metadata only; the plaintext API Key still stays in the in-memory key map.
- Model discovery and image generation accept `providerId`; the server resolves the API Key internally.
- Fastify logging redacts Authorization headers, `apiKey`, upload `dataUrl`, and nested input image data URLs.
- Public error details are sanitized for known secrets, bearer tokens, API key fields, token fields, `sk-*` key patterns, and image data URLs.
- Server history stores generation parameters, provider/model names, generated image metadata/URLs, generated local asset paths, and reference image metadata only.
- Server history does not store API Keys, Authorization headers, provider runtime configs, uploaded reference image bytes, or uploaded reference image data URLs.
- Browser `localStorage` is no longer used for new generation history. Existing `image2:generation-history:v1` records are imported to the server once and removed only after a successful import.
- Imported history is rebuilt from whitelisted fields. Sensitive metadata keys such as `apiKey`, Authorization, token, secret, and data URL fields are stripped before persistence.

### Provider Base URL And SSRF

- Provider URLs are validated before saving, updating, testing, listing models, or generating images.
- Production allows HTTPS provider URLs only.
- HTTP provider URLs are allowed only for localhost when local provider URLs are enabled.
- Local provider URLs are controlled by `ALLOW_LOCAL_PROVIDER_URLS`.
- `ALLOW_LOCAL_PROVIDER_URLS` defaults to enabled outside production and disabled in production.
- Direct private, loopback, link-local, carrier-grade NAT, benchmark, multicast, reserved IPv4, unique-local IPv6, link-local IPv6, loopback IPv6, unspecified IPv6, multicast IPv6, and IPv4-mapped private IPv6 addresses are blocked unless they are localhost and local provider URLs are enabled.
- Hostnames are DNS-resolved during validation; hostnames that resolve to private addresses are blocked.
- Hostnames that cannot be DNS-verified are blocked.
- Provider fetches use `redirect: "manual"` to avoid following redirects to a different host.

### Uploads

- Reference uploads accept only PNG, JPEG, and WebP data URLs.
- Declared MIME type must match the data URL MIME type.
- Uploaded image bytes must be non-empty and 5 MB or smaller.
- Upload route body size is capped to accommodate a 5 MB base64 data URL plus JSON overhead.
- Upload responses return metadata and an upload id only; image bytes remain server-side in memory.
- Uploaded reference images are not written to SQLite or the data directory in this phase.

### History And Generated Assets

- Generation history is stored in `IMAGE2_DATA_DIR/image2.sqlite`, defaulting to `.image2-data/image2.sqlite` when unset.
- The history schema separates `generation_history` and `generation_images`.
- Provider-returned generated `data:image/png`, `data:image/jpeg`, and `data:image/webp` result URLs are decoded and saved below `IMAGE2_DATA_DIR/assets/generated/YYYY/MM/`.
- Generated asset filenames use internal UUIDs, not prompts, provider names, model names, or uploaded filenames.
- Generated local assets are served only through `/api/history/images/:id/file`, which resolves the asset path from SQLite and checks it remains inside the configured data directory.
- Remote generated image URLs are stored as URLs only. The server does not fetch remote result URLs, avoiding new SSRF exposure for result retention in this phase.
- Deleting one history item or clearing history also removes generated local asset files associated with those history rows.

### Errors And Logs

- App errors use normalized `code`, `message`, and optional sanitized `detail`.
- Provider response bodies included in error details are whitespace-normalized, length-limited, and redacted.
- Auth failures return status-based details only.
- Unexpected server errors return a generic `INTERNAL_ERROR` response.

### CORS

- Production has no permissive default CORS policy.
- Direct browser API access requires `CORS_ORIGIN` to list allowed origins.
- Development defaults allow only `http://localhost:5173` and `http://127.0.0.1:5173`.
- Preflight requests from unconfigured origins return 403.

### Timeouts

- Connection tests time out after 5 seconds.
- Model discovery times out after 10 seconds.
- Image generation times out after 60 seconds.
- Timeout failures are normalized and sanitized before being returned.

## Security Tests

Current server tests cover:

- Provider create/list/update/delete responses do not return plaintext API Keys.
- Provider connection tests send Authorization only server-side.
- Auth errors do not echo API Keys.
- Localhost URLs are blocked in production.
- Localhost URLs are blocked when `ALLOW_LOCAL_PROVIDER_URLS=false`.
- Private network provider URLs are blocked during provider save.
- CORS allows configured origins and rejects unconfigured origins.
- Model-list provider error details are redacted.
- Generation provider error details are redacted.
- Uploads reject unsupported MIME types.
- Uploads reject files over 5 MB.
- Upload responses do not return image data.
- Generation responses do not return API Keys or uploaded reference bytes.
- Server tests confirm history persists across store restart, delete/clear works, and history responses do not contain API Keys.
- Server import tests confirm sensitive metadata and image data URLs are not preserved from browser history imports.
- Browser tests confirm new generations do not write the old localStorage history key and old localStorage history migrates without breaking the UI.

Run the full release gate:

```bash
npm run check
```

## Environment

Use `.env.example` as the release configuration template.

Important variables:

- `HOST`: server bind host, default `127.0.0.1`
- `PORT`: server port, default `3001`
- `LOG_LEVEL`: Fastify log level, default `info`
- `CORS_ORIGIN`: comma-separated allowed origins for direct browser API calls
- `ALLOW_LOCAL_PROVIDER_URLS`: set `true` only when intentionally calling localhost providers
- `IMAGE2_DATA_DIR`: local SQLite database and generated result asset directory

## Known Limitations

- API Keys are in memory only. Restarting the server clears provider configs and keys.
- There is no encrypted durable provider storage yet.
- Uploaded images are held in memory and are lost on restart.
- Uploaded images are not yet garbage-collected by age or total memory pressure.
- SQLite history is not encrypted and may include prompts, generated image remote URLs, and local generated asset paths.
- Provider remote result URLs are displayed and linked by the browser; future releases should add stricter result URL validation or opt-in remote URL copy-down if remote result retention becomes a release requirement.
- Generated result files can consume local disk space. This phase deletes associated generated assets when history is deleted, but does not implement quota-based cleanup.
- DNS validation reduces SSRF risk but cannot eliminate all DNS rebinding risks for long-running sessions. Provider fetches revalidate URLs at call time and do not follow redirects.
