#!/bin/bash
set -e

echo "=== Post-merge setup: Jastip Anggun Jaya ==="

echo "1. Installing dependencies..."
pnpm install --frozen-lockfile

echo "2. Pushing database schema..."
pnpm --filter @workspace/db run push

echo "3. Seeding service_types and legacy batch (idempotent)..."
npx tsx scripts/migrate-batch-legacy.ts

echo "4. Seeding Phase 4 shipping minimums (disabled by default)..."
pnpm --filter @workspace/scripts run migrate-shipping-minimum

echo "5. Seeding demo accounts (if not already present)..."
pnpm --filter @workspace/scripts run seed-demo

echo "=== Setup complete ==="
