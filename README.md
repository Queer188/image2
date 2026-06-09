# image2 Tool

image2 Tool is a local-first image generation workbench. Phase 1 supports API provider configuration and connection testing through a React web app and Fastify API server.

## Current Phase

Phase 1: provider configuration and connection testing.

Included:

- npm workspace layout for web, server, and shared packages
- Vite React frontend with a provider configuration form
- Fastify backend with `GET /health` and provider configuration APIs
- Shared package contracts for provider configuration and API errors
- Provider create, list, update, delete, and connection test endpoints
- API Key redaction in responses and logs
- lint, test, build, and dev scripts

Not included yet:

- Model discovery
- Text-to-image generation
- Image-to-image generation
- History management

Provider data is stored in server memory for this phase. API Keys are not returned to the browser and are not written to durable storage in cleartext.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Getting Started

```bash
npm install
npm run dev
```

The web app runs on [http://localhost:5173](http://localhost:5173).
The server runs on [http://localhost:3001](http://localhost:3001).

## Scripts

```bash
npm run dev        # start web and server together
npm run dev:web    # start only the Vite web app
npm run dev:server # start only the Fastify API server
npm run lint       # run ESLint
npm test           # run package tests
npm run build      # build all packages
```

## Health Check

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "image2-server"
}
```

## Provider API

```bash
curl http://localhost:3001/api/providers
```

Create a provider:

```bash
curl -X POST http://localhost:3001/api/providers \
  -H "content-type: application/json" \
  -d '{"name":"Example","baseUrl":"https://api.example.com/v1","apiKey":"sk-..."}'
```

Test a provider before saving:

```bash
curl -X POST http://localhost:3001/api/providers/test \
  -H "content-type: application/json" \
  -d '{"baseUrl":"https://api.example.com/v1","apiKey":"sk-..."}'
```

The connection test sends a lightweight `GET` request to the configured base URL with a bearer token. It does not discover models or generate images.
