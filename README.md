# Smart Wildlife Conservation and Anti-Poaching Monitoring System

SE3070 foundation repository for a TypeScript-based wildlife field operations and conservation analytics platform. This phase establishes the shared technical foundation only; it does not implement the four business workflows.

## Use cases

- **UC-A Manage Ranger Patrols** — patrol assignments, sessions, routes, and waypoints; supports offline field work.
- **UC-B Report & Manage Conservation Incidents** — incident capture and evidence; supports offline field work.
- **UC-C Manage Wildlife Conflict Alerts & Response** — collar/community alerts and field response; field response supports offline work.
- **UC-D Analyze Conservation Data & Generate Reports** — central online manager analytics over synchronized patrol, incident, and conflict data.

## Architecture

The online path is `React PWA → Express REST API → Mongoose → MongoDB Atlas`. Offline field operations use `React PWA → Dexie/IndexedDB → sync queue → Express API → MongoDB`. The PWA service-worker cache is for application assets and is separate from IndexedDB business data. Synchronization is application logic, not an automatic service-worker feature.

## Technology stack

TypeScript, React + Vite, Tailwind CSS, React Router, vite-plugin-pwa, Express, Mongoose, MongoDB Atlas, Dexie, Axios, Zod, Leaflet/React Leaflet, Recharts, Jest/Supertest, Vitest/React Testing Library, ESLint, Prettier, and npm. Docker, PostgreSQL, Prisma, NestJS, GraphQL, Redis, Kafka, ML, and native mobile development are intentionally excluded.

## Folder structure

```text
client/                 React PWA and shared client services
  src/features/         patrols, incidents, conflict-alerts, analytics
  src/offline/          Dexie database and reusable sync service
server/                 Express API
  src/modules/          patrols, incidents, conflict-alerts, analytics
docs/                   project documentation space
.mcp.json               project-scoped filesystem MCP template
```

Each client feature has `components/`, `pages/`, `api/`, `hooks/`, `schemas/`, and `types/`. Each server module has a route/controller/service/model inventory ready for incremental implementation.

## Prerequisites and installation

Install Node.js 20+ and npm. From the repository root: `npm install`.

### Frontend setup

`copy client/.env.example client/.env` then run `npm run dev --workspace client`. The client runs at `http://localhost:5173`.

### Backend setup

`copy server/.env.example server/.env` then run `npm run dev --workspace server`. The API requires `MONGODB_URI` before startup and fails clearly when it is missing. `GET /api/health` is available once the server starts.

## MongoDB Atlas manual configuration

A team member must manually: create a MongoDB Atlas project/cluster; create a database user; configure network access; obtain a MongoDB URI; and paste it into `server/.env` as `MONGODB_URI=...`. No Atlas account, cluster, or credential is created by this repository.

## Environment variables

`client/.env.example` contains `VITE_API_URL=http://localhost:5001/api`. `server/.env.example` contains `PORT` (default `5001`), `MONGODB_URI`, `CLIENT_URL`, and `NODE_ENV`. Real `.env` files are ignored by Git; never commit credentials.

## PWA and offline architecture

vite-plugin-pwa is configured with auto-update registration, standalone display, the `WildlifeGuard` short name, theme/background colors, `/` start URL, and 192×192 and 512×512 icons. A production build generates the manifest and service worker. Browser-specific localhost installability limitations do not prevent normal development.

Dexie initializes tables for patrol sessions, waypoints, incidents, conflict responses, and the sync queue. The shared sync service detects online/offline changes, queues operations, attempts processing when connectivity returns, retains failed operations, and supports retry. Status meanings are `LOCAL` (device-only), `PENDING` (queued), `SYNCING` (request in progress), `SYNCED` (server accepted), and `FAILED` (retained after an error).

## Commands

`npm run dev` · `npm run build` · `npm run test:client` · `npm run test:server` · `npm run lint` · `npm run format`

## Testing

Frontend uses Vitest, jsdom, React Testing Library, and jest-dom. Backend uses Jest and Supertest. Foundation tests cover application rendering, ranger/manager routes, and the health endpoint. The Dexie layer is an importable test-compatible abstraction.

## MCP setup

`.mcp.json` is a project-local filesystem-only template restricted to this project directory. It contains no secrets or external service credentials. If the current AI coding environment uses a different MCP schema, adapt a copy to that environment rather than overwriting its active configuration. No unverified MCP server package is required for application runtime.

## Branch convention

Use `main`, `develop`, `feature/uc-a-patrols`, `feature/uc-b-incidents`, `feature/uc-c-conflict-alerts`, `feature/uc-d-analytics`, and `feature/shared-sync`. Remote branches are not created automatically.

## Security

Do not commit MongoDB URIs, passwords, API keys, tokens, or any real `.env` file.

## Recommended next task

Agree on shared domain DTOs and authentication/authorization boundaries, then implement UC-A patrol contracts and its offline sync endpoint first. Keep the route → controller → service → model boundary intact.
