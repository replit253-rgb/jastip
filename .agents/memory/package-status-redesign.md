---
name: Package status redesign
description: Status enum reduced to pending/diserahkan; customer role removed; packageMode added
---

## Rule
Package status enum is now only `["pending", "diserahkan"]`. All old references to `in_transit`, `ready`, `picked_up` must be updated.

**Why:** User requested simplification — packages are either waiting (pending) or handed over (diserahkan).

**How to apply:** When adding new status filters or stats, only use these two values. The `diserahkan` status is set via the `/api/packages/:id/serahkan` endpoint; `tolak` resets back to `pending`.

## Also changed
- Customer routes are absent from the active frontend router, but the customer role remains in the schema and the public register endpoint/page is still present.
- `packageMode` column added to packages table: "single" or "grup"
- Scan page has Serahkan and Tolak buttons (no more generic confirm)
- Barcode page has 2 tabs (1 Paket / Grup Paket) with pagination
- Label print opens full A4 window with package info grid
- Ongkir auto-calculated from bracket tables in packages-new.tsx

## Verification status (separate concept from delivery status)
Packages also have a `verified` field (`belum_diverifikasi` / `sudah_diverifikasi`) + `verifiedAt` timestamp — independent from `status` (pending/diserahkan).

**Why:** Owner wanted persisted proof that admin/verify page confirmed package ownership via scan, separate from whether it's been picked up/delivered.

**How to apply:** Set via `POST /api/packages/:id/verify` (called automatically from admin/verify.tsx when a scanned barcode matches the selected customer group). Don't conflate this with `status`.
