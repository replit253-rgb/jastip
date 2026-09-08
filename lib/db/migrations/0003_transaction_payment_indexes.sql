-- Fase 2: indexes for transaction/payment history and receivable reporting.
-- Additive only.
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "payment_method" text;
CREATE INDEX IF NOT EXISTS "transactions_created_at_idx"
  ON "transactions" ("created_at");
CREATE INDEX IF NOT EXISTS "transactions_payment_status_idx"
  ON "transactions" ("payment_status");
CREATE INDEX IF NOT EXISTS "payments_transaction_created_at_idx"
  ON "payments" ("transaction_id", "created_at");
CREATE INDEX IF NOT EXISTS "payments_shift_created_at_idx"
  ON "payments" ("shift_session_id", "created_at");