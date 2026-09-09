-- Fase 6: struk transaksi dan mode cetak.
-- Default aman untuk kasir: minta konfirmasi sebelum membuka dialog print.
INSERT INTO "settings" ("key", "value")
VALUES ('receipt_print_mode', 'ASK')
ON CONFLICT ("key") DO NOTHING;

CREATE INDEX IF NOT EXISTS "print_logs_entity_idx"
  ON "print_logs" ("entity_type", "entity_id", "print_type");