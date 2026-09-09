-- Fase 4: satu pengaturan minimum per layanan dan kota asal.
-- Additive only: tidak menghapus atau mengubah data ongkir existing.

CREATE UNIQUE INDEX IF NOT EXISTS "settings_shipping_minimum_service_origin_idx"
  ON "settings_shipping_minimum" ("service_id", "origin_city");