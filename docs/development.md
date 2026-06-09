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

## Phase 1 Notes

- The web app proxies `/api` and `/health` to the local Fastify server during Vite development.
- Provider configuration is stored in server memory. Restarting the server clears providers and API keys.
- Plaintext API keys are accepted only in create, update, and test request bodies. They are not returned to the browser.
- Connection testing performs a lightweight request to the configured base URL. Model discovery starts in a later phase.
