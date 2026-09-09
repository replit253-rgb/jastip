---
name: Jastip JAJ project
description: Main working app details, conventions, and key decisions for the Jastip Anggun Jaya logistics platform.
---

# Jastip Anggun Jaya — Project Notes

## App location
- Frontend: `artifacts/jastip/` (port 5000)
- Backend API: `artifacts/api-server/` (port 8080)
- DB lib: `lib/db/` (Drizzle ORM, PostgreSQL)

## Auth
- Password hash: SHA256(password + "jaj_salt_2024")
- Demo accounts: Owner 081200000000/owner123, Admin 081200000001/admin123

## Database
- DATABASE_URL is set (PostgreSQL via Replit)
- Schema push: `pnpm --filter @workspace/db run push`
- After push, run: `npx tsx scripts/migrate-batch-legacy.ts` (seeds service_types, creates legacy batch, backfills existing packages)
- Demo seed: `pnpm --filter @workspace/scripts run seed-demo`

## Key schema decisions
- `packages` table has BOTH old fields (`status`, `verified`) and new fields (`statusVerifikasi`, `statusPengambilan`, `statusPembayaran`)
- The verify endpoint (`POST /packages/:id/verify`) updates BOTH `verified` AND `statusVerifikasi`
- Frontend code should use NEW fields: `statusVerifikasi`, `statusPengambilan`, `statusPembayaran`
- `batch_id` is FK to `batches` table; `service_type_id` is FK to `service_types` table
- Legacy batch (id=1) has statusBatch=ARSIP and covers all pre-batch data

## Grouping rule (critical)
Packages MUST be grouped by `customerName + serviceType + batchId` in ALL views:
- barcode.tsx: ✅ fixed (composite key)
- barcode-group-detail.tsx: ✅ fixed (filters by serviceType+batchId URL params)
- verify.tsx: ✅ fixed (PkgGroup has batchId, isMatch checks all three)
- scan.tsx: POS-style (per package), no grouping issue

## Lock rule
- `statusPengambilan = SUDAH_DIAMBIL` is PERMANENT. Backend enforces via atomic check.
- UI must NOT show "Kembalikan ke Pending" for already-delivered packages. (✅ fixed in scan.tsx)
- Backend `/tolak` endpoint uses atomic `ne(statusPengambilan, "SUDAH_DIAMBIL")` check.

## Batch rules
- Batch selector is required in Input Paket form and Import Excel (both validate before save)
- API: POST /packages requires batchId, rejects CLOSED/ARSIP batches
- "admin utama" role for susulan after CLOSED = Owner role (not a separate role)

**Why:** Architecture bug — grouping by name only caused cross-batch and cross-service data mixing. Composite key is the fix.

## Re-import / fresh-DB setup order (critical)
After `pnpm install` + `pnpm --filter @workspace/db run push` + `seed-demo`, you MUST also run
`npx tsx scripts/migrate-batch-legacy.ts` — otherwise `service_types` stays empty and package creation
with a serviceType silently gets `serviceTypeId: null` (no error, but batch grouping/reports break).

Development database instances may be empty even when the schema and setup scripts are present in the
workspace. Always verify the Phase 0/1 table set before beginning any later phase; then run schema push,
legacy batch/service seed, demo seed, and the finance/shift smoke checks.

For Phase 2, a debt transaction may exist without a payment row until money is received. The nullable
`payments.payment_method` is intentional: actual settlement payments store their real method, while
legacy debt records remain compatible.

## Features added (July 2026)
- **Tetap di halaman input setelah simpan**: Single mode simpan → stay on page, reset form, tampil card sukses dengan tombol Cetak Barcode. State: `lastSavedId`.
- **Pengaturan Tarif (Owner only)**: `/owner/tarif` — edit pesawatRate, hematRate, kargoRate, pelniTiersJakarta/Surabaya. PATCH `/api/settings` sekarang Owner-only, simpan history ke `tarif_history` table. GET `/api/settings/history` endpoint.
- **Pengeluaran Harian**: `/owner/pengeluaran` — CRUD pengeluaran, filter tanggal/kategori/metode, export Excel. DB table `pengeluaran`. API `/api/pengeluaran`.
- **Diskon Nominal di Scan**: Field diskon (Rp, bukan %) + alasan (wajib jika ada diskon) di payment modal scan.tsx. totalAkhir = totalTagihan - diskon.

## OpenAPI spec must match actual DB/route fields
`lib/api-spec/openapi.yaml` is the source of truth for generated types in `lib/api-zod` and
`lib/api-client-react` (via `pnpm run codegen` in `lib/api-spec`). It had drifted from the real API:
Package schema was missing `deliveryRoute` (routes/packages.ts returns it, DB has the column) — caused
TS2339 in arsip-batch-detail.tsx / barcode-batch-detail.tsx. Batch schema never had a `name` field (only
`namaKapal` + computed `label`); a `batch.name || batch.namaKapal` fallback was dead code. Run typecheck
after any schema/route change to catch this class of drift early.

The pinned Orval codegen version can generate `zod.int()` and `Headers.entries()` for newer OpenAPI
contracts, which fail against this workspace's current Zod and TypeScript library definitions. The active
frontend uses direct `fetch` for the affected Fase 6 flows, so this is a planned codegen debt rather than
a runtime blocker.

**Why:** Fase 6 receipt contracts reproduced the incompatibility during the official codegen command.

**How to apply:** Treat generated-client/codegen synchronization as a planned follow-up; do not silently
change the pinned generator or make OpenAPI codegen a release blocker until Orval is upgraded or replaced.
