/**
 * Seeds the Phase 4 shipping minimum rows without overwriting Owner changes.
 * All rows start disabled so existing shipping behavior is preserved.
 */
import {
  db,
  serviceTypesTable,
  settingsShippingMinimumTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

const DEFAULTS = [
  { serviceName: "jastip pelni", originCity: "Jakarta", minimumAmount: 20000 },
  { serviceName: "jastip pelni", originCity: "Surabaya", minimumAmount: 18000 },
  { serviceName: "jastip hemat+", originCity: "Surabaya", minimumAmount: 10000 },
  {
    serviceName: "jastip kargo",
    originCity: "Jakarta/Surabaya",
    minimumAmount: 25000,
  },
] as const;

async function main() {
  console.log("=== Fase 4 — Seed harga ongkir minimum ===");
  const services = await db.select().from(serviceTypesTable);
  const serviceByName = new Map(services.map((service) => [service.name, service]));

  for (const item of DEFAULTS) {
    const service = serviceByName.get(item.serviceName);
    if (!service) {
      throw new Error(`Service type belum tersedia: ${item.serviceName}`);
    }
    const existing = await db
      .select({ id: settingsShippingMinimumTable.id })
      .from(settingsShippingMinimumTable)
      .where(
        and(
          eq(settingsShippingMinimumTable.serviceId, service.id),
          eq(settingsShippingMinimumTable.originCity, item.originCity),
        ),
      )
      .limit(1);
    if (existing[0]) {
      console.log(`  • ${item.serviceName}/${item.originCity}: sudah ada, tidak diubah`);
      continue;
    }
    await db.insert(settingsShippingMinimumTable).values({
      serviceId: service.id,
      originCity: item.originCity,
      enabled: false,
      minimumAmount: String(item.minimumAmount),
    });
    console.log(`  ✓ ${item.serviceName}/${item.originCity}: Rp${item.minimumAmount} (OFF)`);
  }
  console.log("Seed harga minimum selesai.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});