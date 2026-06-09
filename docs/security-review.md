# Security Review

## Phase 1 Checks

- API Keys are never returned from provider APIs.
- API Keys are not stored in browser localStorage or IndexedDB.
- API Keys are held only in an in-memory server map for this phase.
- Fastify logger redacts Authorization headers and `apiKey` fields.
- Error responses use normalized messages and do not include request bodies.
- Provider URLs must use HTTPS, except localhost HTTP in non-production development.
- Direct private network IPs are blocked unless they are localhost in development.
- Resolved private network addresses are blocked when DNS resolution succeeds.

## Known Limitations

- The in-memory key store is not durable. A later phase should use a keychain or encrypted server-side storage.
- The connection test checks reachability and explicit auth rejection only. It does not fetch models in Phase 1.
