import { db, batchesTable, packagesTable } from "@workspace/db";

async function seed() {
  console.log("Seeding batch #2 with grouped packages...");

  // Insert a throwaway batch first so the real one lands on id 2
  // (matching the /admin/barcode/batch/2 URL used to reproduce the bug).
  await db.insert(batchesTable).values({
    namaKapal: "KM Cendrawasih",
    etd: "2026-06-01",
    periodeClosingMulai: "2026-05-25",
    periodeClosingSelesai: "2026-05-30",
    kotaAsal: "Jakarta",
    tujuan: "Manokwari",
    statusBatch: "ARSIP",
  });

  const [batch] = await db
    .insert(batchesTable)
    .values({
      namaKapal: "KM Sinar Papua",
      etd: "2026-07-20",
      periodeClosingMulai: "2026-07-14",
      periodeClosingSelesai: "2026-07-18",
      kotaAsal: "Surabaya",
      tujuan: "Manokwari",
      statusBatch: "OPEN",
    })
    .returning();

  console.log("Batch created with id:", batch.id);

  const groups: { customerName: string; serviceType: string; count: number }[] = [
    { customerName: "Teh Wulan Sari", serviceType: "jastip pelni", count: 6 },
    { customerName: "Ilham Nugroho", serviceType: "jastip pelni", count: 2 },
    { customerName: "Rama Setiawan", serviceType: "jastip pelni", count: 1 },
  ];

  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      const rand = Math.random().toString(36).slice(2, 10);
      const barcode = `JAJ-${Date.now().toString(36)}${i}-${rand}`;
      await db.insert(packagesTable).values({
        barcode,
        resiNumber: rand.toUpperCase() + Math.floor(Math.random() * 999),
        customerName: g.customerName,
        serviceType: g.serviceType,
        deliveryRoute: "Surabaya → Manokwari",
        packagingType: "Kardus",
        realWeight: (Math.random() * 1.5 + 0.1).toFixed(2),
        usedWeight: (Math.random() * 1.5 + 0.1).toFixed(2),
        totalShipping: String(Math.floor(Math.random() * 20000 + 5000)),
        status: "pending",
        batchId: batch.id,
        packageDate: new Date(),
      });
    }
    console.log(`  Seeded ${g.count} packages for ${g.customerName}`);
  }

  console.log("Done. Batch id:", batch.id);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
