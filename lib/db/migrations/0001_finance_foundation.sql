-- Fase 0: fondasi shift, transaksi, VOID, invoice, print log, dan minimum ongkir.
-- Additive only: tidak mengubah atau menghapus tabel/kolom existing.

CREATE TABLE IF NOT EXISTS "shift_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "admin_id" integer NOT NULL REFERENCES "users"("id"),
  "shift_type" text NOT NULL,
  "terminal_id" text,
  "scheduled_start" timestamp with time zone,
  "scheduled_end" timestamp with time zone,
  "actual_start" timestamp with time zone,
  "actual_end" timestamp with time zone,
  "opening_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
  "status" text DEFAULT 'AKTIF' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "transaction_no" text NOT NULL UNIQUE,
  "customer_id" integer REFERENCES "users"("id"),
  "customer_name" text NOT NULL,
  "package_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "subtotal" numeric(15, 2) DEFAULT '0' NOT NULL,
  "discount" numeric(15, 2) DEFAULT '0' NOT NULL,
  "discount_reason" text,
  "total" numeric(15, 2) DEFAULT '0' NOT NULL,
  "payment_status" text DEFAULT 'BELUM_BAYAR' NOT NULL,
  "transaction_status" text DEFAULT 'AKTIF' NOT NULL,
  "sisa_piutang" numeric(15, 2) DEFAULT '0' NOT NULL,
  "jenis_jastip" text,
  "jatuh_tempo" date,
  "penanggung_jawab" text,
  "shift_session_id" integer REFERENCES "shift_sessions"("id"),
  "cashier_id" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "voids" (
  "id" serial PRIMARY KEY NOT NULL,
  "transaction_id" integer NOT NULL REFERENCES "transactions"("id"),
  "reason_code" text NOT NULL,
  "notes" text,
  "requested_by" integer NOT NULL REFERENCES "users"("id"),
  "approved_by" integer REFERENCES "users"("id"),
  "approved_at" timestamp with time zone,
  "reversal_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
  "package_ids_returned" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status_before" text NOT NULL,
  "status_after" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "invoices" (
  "id" serial PRIMARY KEY NOT NULL,
  "invoice_no" text NOT NULL UNIQUE,
  "transaction_id" integer REFERENCES "transactions"("id"),
  "customer_snapshot" jsonb NOT NULL,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "due_at" timestamp with time zone,
  "subtotal" numeric(15, 2) DEFAULT '0' NOT NULL,
  "discount" numeric(15, 2) DEFAULT '0' NOT NULL,
  "down_payment" numeric(15, 2) DEFAULT '0' NOT NULL,
  "total" numeric(15, 2) DEFAULT '0' NOT NULL,
  "balance" numeric(15, 2) DEFAULT '0' NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "manual_reason" text
);

CREATE TABLE IF NOT EXISTS "invoice_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "invoice_id" integer NOT NULL REFERENCES "invoices"("id"),
  "package_id" integer REFERENCES "packages"("id"),
  "description" text NOT NULL,
  "qty" integer DEFAULT 1 NOT NULL,
  "weight" numeric(10, 2),
  "volume" numeric(10, 2),
  "unit_price" numeric(15, 2) DEFAULT '0' NOT NULL,
  "line_total" numeric(15, 2) DEFAULT '0' NOT NULL
);

CREATE TABLE IF NOT EXISTS "print_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" integer,
  "print_type" text NOT NULL,
  "printed_by" integer REFERENCES "users"("id"),
  "printed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "copy_number" integer DEFAULT 1 NOT NULL,
  "is_reprint" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "settings_shipping_minimum" (
  "id" serial PRIMARY KEY NOT NULL,
  "service_id" integer NOT NULL REFERENCES "service_types"("id"),
  "origin_city" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "minimum_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
  "updated_by" integer REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "shift_session_id" integer REFERENCES "shift_sessions"("id");

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "transaction_id" integer REFERENCES "transactions"("id");