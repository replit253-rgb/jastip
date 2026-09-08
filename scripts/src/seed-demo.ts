import { db, settingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "jaj_salt_2024").digest("hex");
}

const demoUsers = [
  { name: "Owner JAJ", phone: "081200000000", password: "owner123", role: "owner" as const },
  { name: "Admin Budi", phone: "081200000001", password: "admin123", role: "admin" as const },
  { name: "Admin Sari", phone: "081200000002", password: "admin123", role: "admin" as const },
  { name: "Rina Wati", phone: "081200000010", password: "customer123", role: "customer" as const },
  { name: "Doni Pratama", phone: "081200000011", password: "customer123", role: "customer" as const },
  { name: "Siti Rahayu", phone: "081200000012", password: "customer123", role: "customer" as const },
];

async function seed() {
  console.log("Seeding demo accounts...");
  for (const u of demoUsers) {
    const existing = await db.select().from(usersTable).where(eq(usersTable.phone, u.phone)).limit(1);
    if (existing[0]) {
      console.log(`  Already exists: ${u.name} (${u.phone}) — skipping`);
      continue;
    }
    await db.insert(usersTable).values({
      name: u.name,
      phone: u.phone,
      password: hashPassword(u.password),
      role: u.role,
      isActive: true,
    });
    console.log(`  Created: ${u.name} (${u.role}) — ${u.phone} / ${u.password}`);
  }
  await db
    .insert(settingsTable)
    .values({ key: "cash_variance_tolerance", value: "0" })
    .onConflictDoNothing();
  console.log("  Ensured default cash variance tolerance: Rp0");
  console.log("Done.");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
