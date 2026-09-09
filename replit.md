# Jastip Anggun Jaya — Logistics Platform

A cargo/logistics management system for Jastip Anggun Jaya, handling package intake, batching, scanning, barcode printing, and delivery tracking for shipments from Java to Papua (Manokwari).

## Stack

- **Frontend**: React + Vite + TypeScript (`artifacts/jastip/`, port 5000)
- **API**: Node.js + Express + TypeScript (`artifacts/api-server/`, port 8080)
- **Database**: PostgreSQL via Replit (Drizzle ORM, `lib/db/`)
- **Package manager**: pnpm workspaces

## Running the app

Both workflows start automatically:

| Workflow | Command | Port |
|---|---|---|
| Start application | `PORT=5000 pnpm --filter @workspace/jastip run dev` | 5000 |
| API Server | `PORT=8080 pnpm --filter @workspace/api-server run dev` | 8080 |

## First-time database setup

After a fresh clone or import, run these in order:

```bash
# 1. Install dependencies
pnpm install

# 2. Push schema to the database
pnpm --filter @workspace/db run push

# 3. Seed service_types and create legacy batch (required before any package creation)
pnpm --filter @workspace/scripts exec tsx ./migrate-batch-legacy.ts

# 4. Seed demo accounts and sample data
pnpm --filter @workspace/scripts run seed-demo
```

## Demo accounts

| Role | Phone | Password |
|---|---|---|
| Owner | 081200000000 | owner123 |
| Admin | 081200000001 | admin123 |

## Key conventions

- Password hash: `SHA256(password + "jaj_salt_2024")`
- Packages must be grouped by `customerName + serviceType + batchId` in all views
- `statusPengambilan = SUDAH_DIAMBIL` is permanent — backend enforces atomically
- OpenAPI spec (`lib/api-spec/openapi.yaml`) is source of truth for generated types; run `pnpm run codegen` in `lib/api-spec` after any schema/route change

## User preferences

- Keep existing project structure and stack — do not restructure or migrate
