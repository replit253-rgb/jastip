-- Fase 3: flag reversal yang disetujui setelah shift transaksi asal ditutup.
-- Additive only.
ALTER TABLE "voids"
  ADD COLUMN IF NOT EXISTS "is_post_closing" boolean DEFAULT false NOT NULL;