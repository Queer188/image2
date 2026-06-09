# Security Review

## Phase 2 Checks

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

## Known Limitations

- The in-memory key store is not durable. A later phase should use a keychain or encrypted server-side storage.
- The connection test checks reachability and explicit auth rejection only.
- Capability detection uses common provider fields and conservative model-name heuristics. Private provider schemas may require adapter-specific mapping later.
