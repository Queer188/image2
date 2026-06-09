# Security Review

## Phase 4 Checks

- API Keys are never returned from provider APIs.
- API Keys are not stored in browser localStorage or IndexedDB.
- API Keys are held only in an in-memory server map for this phase.
- Fastify logger redacts Authorization headers and `apiKey` fields.
- Error responses use normalized messages and do not include request bodies.
- Provider URLs must use HTTPS, except localhost HTTP in non-production development.
- Direct private network IPs are blocked unless they are localhost in development.
- Resolved private network addresses are blocked when DNS resolution succeeds.
- Model discovery accepts only `providerId` from the browser and resolves API Keys server-side.
- Provider model-list response summaries are length-limited and sanitized before being placed in error details.
- Authorization headers are sent only from the server adapter to the configured provider.
- Text-to-image generation accepts only provider/model ids and generation parameters from the browser.
- Reference image uploads accept only PNG, JPEG, and WebP data URLs.
- Reference image uploads are limited to 5 MB.
- Upload responses return metadata only and do not echo uploaded image bytes.
- Image-to-image generation accepts `inputImageId`; the server resolves stored image bytes internally.
- Generation requests resolve API Keys server-side and send Authorization headers only from the server adapter.
- Generation error details are length-limited and sanitized before being returned.
- Image generation count is limited to 4 per request in this phase.
- Fastify logger redacts upload `dataUrl` fields if request bodies are logged.

## Known Limitations

- The in-memory key store is not durable. A later phase should use a keychain or encrypted server-side storage.
- The connection test checks reachability and explicit auth rejection only.
- Capability detection uses common provider fields and conservative model-name heuristics. Private provider schemas may require adapter-specific mapping later.
- Generated image URLs are displayed in the browser. A later phase should add stronger URL validation and local asset storage if results need to be retained.
- Uploaded images are stored in server memory for this phase. They are lost on restart and are not yet garbage-collected by age.
