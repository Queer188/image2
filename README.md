# image2 Tool

image2 Tool is a local-first image generation workbench. Phase 0 only establishes the project skeleton: a React web app, a Fastify API server, shared TypeScript types, and basic development scripts.

## Current Phase

Phase 0: project scaffold.

Included:

- npm workspace layout for web, server, and shared packages
- Vite React frontend with an empty main workspace
- Fastify backend with `GET /health`
- Shared package for future API contracts
- lint, test, build, and dev scripts

Not included yet:

- Provider configuration persistence
- Model discovery
- Text-to-image generation
- Image-to-image generation
- History management

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
