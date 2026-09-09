-- Fase 5: idempotent payment confirmation and transfer reference.
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "transactions_idempotency_key_unique"
  ON "transactions" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "payment_reference" text;