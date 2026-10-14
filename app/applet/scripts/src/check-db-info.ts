import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function check() {
  try {
    const resVersion = await db.execute(sql`SELECT version();`);
    console.log("VERSION:", resVersion);
  } catch (e: any) {
    console.log("Version query error (might be SQLite):", e.message);
  }
  try {
    const resTz = await db.execute(sql`SHOW timezone;`);
    console.log("TIMEZONE:", resTz);
  } catch (e: any) {
    console.log("Timezone query error:", e.message);
  }
  try {
    const resDb = await db.execute(sql`SELECT current_database();`);
    console.log("CURRENT DATABASE:", resDb);
  } catch (e: any) {
    console.log("Database name query error:", e.message);
  }
}
check();
