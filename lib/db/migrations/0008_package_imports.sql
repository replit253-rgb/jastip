-- Revisi 4: Pelacakan asal impor Excel pada paket (aman untuk data produksi yang sudah ada)
CREATE TABLE IF NOT EXISTS "package_imports" (
  "id" serial PRIMARY KEY NOT NULL,
  "batch_id" integer NOT NULL REFERENCES "batches"("id"),
  "file_name" text,
  "package_count" integer DEFAULT 0 NOT NULL,
  "imported_by" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_package_imports_batch_id"
  ON "package_imports" ("batch_id");

ALTER TABLE "packages"
  ADD COLUMN IF NOT EXISTS "import_id" integer REFERENCES "package_imports"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "imported_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "input_source" text;

CREATE INDEX IF NOT EXISTS "idx_packages_import_id"
  ON "packages" ("import_id");
