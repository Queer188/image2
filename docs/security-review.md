# Security Review

## v0.2 Release Review

Status: ready for local v0.2 release when `npm run check` passes.

Scope: React frontend, Fastify API server, provider adapters, provider URL validation, upload handling, SQLite-backed generation history, and generated result asset storage.

## Security Model

image2 v0.2 is a local single-user tool. It is not hardened as a public multi-user service. The browser talks to the local Fastify server; the local server talks to third-party image providers.

## API Keys

- Plaintext API Keys are accepted only by provider create, provider update, and provider connection-test requests.
- Plaintext API Keys are stored only in the running server process memory map.
- Provider list/create/update responses return `apiKeyRef` and masked `apiKeyPreview`, never plaintext keys.
- Model discovery and image generation accept `providerId`; the server resolves the API Key internally.
- Fastify logging redacts Authorization headers, `apiKey`, upload `dataUrl`, and nested input image data URLs.
- Public error details are sanitized for known secrets, bearer tokens, API key fields, token fields, `sk-*` key patterns, and inline image data.
- Server history stores generation parameters, provider/model names, generated image metadata/URLs, generated local asset paths, and reference image metadata only.
- Server history does not store API Keys, Authorization headers, provider runtime configs, uploaded reference image bytes, or uploaded reference image data.

Known limitation: API Keys are not durable in v0.2. Restarting the server clears provider configs and keys.

## Provider URL And SSRF Controls

- Provider URLs are validated before saving, updating, testing, model listing, and generation.
- Production allows HTTPS provider URLs only.
- HTTP provider URLs are allowed only for localhost when local provider URLs are explicitly enabled.
- Local provider URLs are controlled by `ALLOW_LOCAL_PROVIDER_URLS`.
- `ALLOW_LOCAL_PROVIDER_URLS` defaults to enabled outside production and disabled in production.
- Direct private, loopback, link-local, carrier-grade NAT, benchmark, multicast, reserved IPv4, unique-local IPv6, link-local IPv6, loopback IPv6, unspecified IPv6, multicast IPv6, and IPv4-mapped private IPv6 addresses are blocked unless they are localhost and local provider URLs are enabled.
- Hostnames are DNS-resolved during validation; hostnames that resolve to private addresses are blocked.
- Hostnames that cannot be DNS-verified are blocked.
- Provider fetches use `redirect: "manual"` to avoid following redirects to a different host.

Residual risk: DNS validation reduces SSRF risk but cannot eliminate every DNS rebinding scenario. Provider URLs are revalidated at call time and redirects are not followed.

## Uploads

- Reference uploads accept only PNG, JPEG, and WebP.
- Declared MIME type must match the uploaded data MIME type.
- Uploaded image bytes must be non-empty and 5 MB or smaller.
- Upload route body size is capped to cover a 5 MB base64 payload plus JSON overhead.
- Upload responses return metadata and an upload id only.
- Uploaded reference images remain in server memory and are not written to SQLite or the data directory in v0.2.

## History And Generated Assets

- Generation history is stored in `IMAGE2_DATA_DIR/image2.sqlite`, defaulting to `.image2-data/image2.sqlite` when unset.
- Provider-returned generated inline PNG/JPEG/WebP result images are decoded and saved below `IMAGE2_DATA_DIR/assets/generated/YYYY/MM/`.
- Generated asset filenames use internal UUIDs, not prompts, provider names, model names, or uploaded filenames.
- Generated local assets are served only through `/api/history/images/:id/file`, which resolves the asset path from SQLite and verifies it remains inside the configured data directory.
- Remote generated image URLs are stored as URLs only. The server does not fetch remote result URLs in v0.2.
- Deleting one history item or clearing history also removes generated local asset files associated with those history rows.
- Imported browser history is rebuilt from whitelisted fields before persistence.

## CORS

- Production has no permissive default CORS policy.
- Direct browser API access requires `CORS_ORIGIN` to list allowed origins.
- Development defaults allow only `http://localhost:5173` and `http://127.0.0.1:5173`.
- Preflight requests from unconfigured origins return 403.

## Error And Log Handling

- App errors use normalized `code`, `message`, and optional sanitized `detail`.
- Provider response bodies included in error details are whitespace-normalized, length-limited, and redacted.
- Auth failures return status-based details only.
- Unexpected server errors return a generic `INTERNAL_ERROR` response.
- Do not add request body dumps, uploaded image content, provider Authorization headers, or raw provider error bodies to logs.

## Node.js SQLite Warning

The server uses Node.js built-in `node:sqlite`. Node.js 22.5 or newer is required. Some Node.js 22 builds may print an experimental warning for `node:sqlite`; that warning is expected for the built-in module and does not mean API Keys are being stored in SQLite. v0.2 SQLite history stores prompts and generated result metadata, not API Keys.

## Security Tests

Current tests cover:

- Provider create/list/update/delete responses do not return plaintext API Keys.
- Provider connection tests send Authorization only server-side.
- Auth errors do not echo API Keys.
- Localhost URLs are blocked in production and when `ALLOW_LOCAL_PROVIDER_URLS=false`.
- Private network provider URLs are blocked during provider save.
- CORS allows configured origins and rejects unconfigured origins.
- Model-list and generation provider error details are redacted.
- Uploads reject unsupported MIME types and files over 5 MB.
- Upload responses do not return image data.
- Generation responses do not return API Keys or uploaded reference bytes.
- History persists across store restart, delete/clear works, and history responses do not contain API Keys.
- History import strips sensitive metadata and inline image data.
- Browser tests confirm new generations do not write the old localStorage history key and old localStorage history migrates without breaking the UI.

Run the release gate:

```bash
npm run check
```

## Environment

Use `.env.example` as the release configuration template.

- `HOST`: server bind host, default `127.0.0.1`
- `PORT`: server port, default `3001`
- `NODE_ENV`: runtime mode; production disables permissive defaults such as local provider URLs unless explicitly configured
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
- Provider remote result URLs are displayed and linked by the browser.
- Generated result files can consume local disk space. Associated generated assets are deleted when history is deleted, but quota cleanup is not implemented.
- Public hosted deployment is not a supported v0.2 scenario.
