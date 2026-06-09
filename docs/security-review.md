# Security Review

## Phase 6 Release Readiness

Status: ready for local MVP release after `npm run check` passes.

This review covers the current React frontend, Fastify API server, provider adapters, upload handling, and browser-local generation history.

## Findings And Controls

### API Keys

- Plaintext API Keys are accepted only by provider create, update, and connection-test requests.
- Plaintext API Keys are stored only in the server process memory map.
- Provider list/create/update responses return `apiKeyRef` and masked `apiKeyPreview`, never plaintext keys.
- Model discovery and image generation accept `providerId`; the server resolves the API Key internally.
- Fastify logging redacts Authorization headers, `apiKey`, upload `dataUrl`, and nested input image data URLs.
- Public error details are sanitized for known secrets, bearer tokens, API key fields, token fields, `sk-*` key patterns, and image data URLs.
- Browser-local history stores generation parameters, provider/model names, generated image metadata/URLs, and reference image metadata only.
- Browser-local history does not store API Keys, Authorization headers, provider runtime configs, uploaded reference image bytes, or uploaded data URLs.

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
- Browser tests confirm history does not contain API Keys, `apiKey`, or uploaded reference data URLs.

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

## Known Limitations

- API Keys are in memory only. Restarting the server clears provider configs and keys.
- There is no encrypted durable provider storage yet.
- Uploaded images are held in memory and are lost on restart.
- Uploaded images are not yet garbage-collected by age or total memory pressure.
- Browser-local history is not encrypted and may include generated image URLs or provider-returned data URLs.
- Provider result URLs are displayed and linked by the browser; future releases should add stricter result URL validation or local asset storage if result retention becomes a release requirement.
- DNS validation reduces SSRF risk but cannot eliminate all DNS rebinding risks for long-running sessions. Provider fetches revalidate URLs at call time and do not follow redirects.
