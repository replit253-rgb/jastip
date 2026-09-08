-- Fase 1.1: closing blind dan serah terima shift.
-- Additive only: tidak mengubah atau menghapus tabel/kolom existing.

CREATE TABLE IF NOT EXISTS "shift_closings" (
  "id" serial PRIMARY KEY NOT NULL,
  "shift_session_id" integer NOT NULL REFERENCES "shift_sessions"("id"),
  "system_cash" integer NOT NULL,
  "actual_cash" integer,
  "selisih" integer,
  "alasan_selisih" text,
  "approved_by" integer REFERENCES "users"("id"),
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "shift_handovers" (
  "id" serial PRIMARY KEY NOT NULL,
  "from_shift_session_id" integer NOT NULL REFERENCES "shift_sessions"("id"),
  "to_shift_session_id" integer NOT NULL REFERENCES "shift_sessions"("id"),
  "handover_amount" integer NOT NULL,
  "confirmed_by_giver" boolean DEFAULT false NOT NULL,
  "confirmed_by_receiver" boolean DEFAULT false NOT NULL,
  "manual_override" boolean DEFAULT false NOT NULL,
  "manual_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Default konservatif Rp0, tetapi nilai disimpan di settings agar Owner dapat
-- mengubahnya tanpa deploy ulang setelah keputusan bisnis dikonfirmasi.
INSERT INTO "settings" ("key", "value")
VALUES ('cash_variance_tolerance', '0')
ON CONFLICT ("key") DO NOTHING;