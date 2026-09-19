import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Checking and migrating additional_fee columns...");

  await db.execute(sql`
    ALTER TABLE packages 
    ADD COLUMN IF NOT EXISTS additional_fee NUMERIC(15, 2) DEFAULT 0;
  `);
  console.log("✓ packages.additional_fee ensured");

  await db.execute(sql`
    ALTER TABLE transactions 
    ADD COLUMN IF NOT EXISTS additional_fee NUMERIC(15, 2) NOT NULL DEFAULT 0;
  `);
  console.log("✓ transactions.additional_fee ensured");

  await db.execute(sql`
    ALTER TABLE transactions 
    ADD COLUMN IF NOT EXISTS additional_fee_reason TEXT;
  `);
  console.log("✓ transactions.additional_fee_reason ensured");

  // Verify
  const cols = await db.execute(sql`
    SELECT table_name, column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name IN ('packages', 'transactions') 
      AND column_name IN ('additional_fee', 'additional_fee_reason')
    ORDER BY table_name, column_name;
  `);
  console.log("Columns verified:", cols.rows);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
