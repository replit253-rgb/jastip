import * as schema from "./schema";
import crypto from "crypto";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "jaj_salt_2024").digest("hex");
}

const mockUsers: any[] = [
  {
    id: 1,
    name: "Owner JAJ",
    phone: "081200000000",
    password: hashPassword("owner123"),
    role: "owner",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    name: "Admin Budi",
    phone: "081200000001",
    password: hashPassword("admin123"),
    role: "admin",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 3,
    name: "Customer Rina",
    phone: "081200000010",
    password: hashPassword("customer123"),
    role: "customer",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockBatches: any[] = [
  {
    id: 1,
    batchNumber: "B-2026-09-001",
    namaKapal: "KM Dobonsolo",
    kotaAsal: "Jakarta",
    tujuan: "Manokwari",
    originCity: "Jakarta",
    destinationCity: "Manokwari",
    deliveryRoute: "Jakarta → Manokwari",
    status: "open",
    statusBatch: "OPEN",
    etd: "2026-07-03",
    periodeClosingMulai: "2026-06-18",
    periodeClosingSelesai: "2026-07-01",
    isLocked: false,
    departureDate: new Date("2026-07-03"),
    notes: "Batch Reguler Pelni Jakarta-Manokwari",
    createdAt: new Date("2026-06-15T00:00:00Z"),
    updatedAt: new Date("2026-06-15T00:00:00Z"),
  },
  {
    id: 2,
    batchNumber: "B-2026-09-002",
    namaKapal: "KM Ciremai",
    kotaAsal: "Surabaya",
    tujuan: "Manokwari",
    originCity: "Surabaya",
    destinationCity: "Manokwari",
    deliveryRoute: "Surabaya → Manokwari",
    status: "open",
    statusBatch: "OPEN",
    etd: "2026-07-15",
    periodeClosingMulai: "2026-07-01",
    periodeClosingSelesai: "2026-07-12",
    isLocked: false,
    departureDate: new Date("2026-07-15"),
    notes: "Batch Cepat Surabaya-Manokwari",
    createdAt: new Date("2026-06-28T00:00:00Z"),
    updatedAt: new Date("2026-06-28T00:00:00Z"),
  },
  {
    id: 3,
    batchNumber: "B-2026-09-003",
    namaKapal: "KM Sinabung",
    kotaAsal: "Surabaya",
    tujuan: "Manokwari",
    originCity: "Surabaya",
    destinationCity: "Manokwari",
    deliveryRoute: "Surabaya → Manokwari",
    status: "closed",
    statusBatch: "CLOSED",
    etd: "2026-06-25",
    periodeClosingMulai: "2026-06-10",
    periodeClosingSelesai: "2026-06-22",
    isLocked: true,
    departureDate: new Date("2026-06-25"),
    notes: "Batch Kargo Pelni Surabaya-Manokwari",
    createdAt: new Date("2026-06-05T00:00:00Z"),
    updatedAt: new Date("2026-06-25T00:00:00Z"),
  },
];

const mockPackages: any[] = [
  {
    id: 1,
    barcode: "JAJ-2026-PKG001",
    resiNumber: "JAJ-001-9821",
    packageNumber: "PK-01",
    customerName: "Customer Rina",
    customerPhone: "081200000010",
    customerId: 3,
    batchId: 1,
    itemName: "Pakaian & Perlengkapan Bayi",
    weight: "3.5",
    realWeight: "3.5",
    length: "30",
    width: "25",
    height: "20",
    volumeWeight: "3.0",
    usedWeight: "3.5",
    packagingType: "karton",
    serviceType: "jastip pelni",
    deliveryRoute: "Jakarta → Manokwari",
    shippingRate: "20000",
    price: "70000",
    totalShipping: "70000",
    status: "tiba",
    statusPengambilan: "BELUM_DIAMBIL",
    paymentStatus: "lunas",
    adminId: 2,
    packageDate: new Date(),
    createdAt: new Date(Date.now() - 3600000 * 24 * 2),
    updatedAt: new Date(),
  },
  {
    id: 2,
    barcode: "JAJ-2026-PKG002",
    resiNumber: "JAJ-002-4412",
    packageNumber: "PK-02",
    customerName: "Customer Rina",
    customerPhone: "081200000010",
    customerId: 3,
    batchId: 2,
    itemName: "Dokumen & Suplemen",
    weight: "1.2",
    realWeight: "1.2",
    length: "20",
    width: "15",
    height: "10",
    volumeWeight: "0.8",
    usedWeight: "1.2",
    packagingType: "plastik",
    serviceType: "jastip pesawat",
    deliveryRoute: "Surabaya → Manokwari",
    shippingRate: "77000",
    price: "92400",
    totalShipping: "92400",
    status: "siap_diambil",
    statusPengambilan: "BELUM_DIAMBIL",
    paymentStatus: "belum_lunas",
    adminId: 2,
    packageDate: new Date(),
    createdAt: new Date(Date.now() - 3600000 * 24),
    updatedAt: new Date(),
  },
  {
    id: 3,
    barcode: "JAJ-2026-PKG003",
    resiNumber: "JAJ-003-7721",
    packageNumber: "PK-03",
    customerName: "Bpk. Hendra",
    customerPhone: "081234567890",
    customerId: null,
    batchId: 1,
    itemName: "Suku Cadang Mesin",
    weight: "8.0",
    realWeight: "8.0",
    length: "40",
    width: "30",
    height: "25",
    volumeWeight: "6.0",
    usedWeight: "8.0",
    packagingType: "kayu",
    serviceType: "jastip kargo",
    deliveryRoute: "Jakarta → Manokwari",
    shippingRate: "7000",
    price: "56000",
    totalShipping: "56000",
    status: "siap_diambil",
    statusPengambilan: "BELUM_DIAMBIL",
    paymentStatus: "belum_lunas",
    adminId: 2,
    packageDate: new Date(),
    createdAt: new Date(Date.now() - 3600000 * 12),
    updatedAt: new Date(),
  },
  {
    id: 4,
    barcode: "JAJ-2026-PKG004",
    resiNumber: "JAJ-004-1102",
    packageNumber: "PK-04",
    customerName: "Ibu Maya",
    customerPhone: "081299887766",
    customerId: null,
    batchId: 1,
    itemName: "Kosmetik & Skincare",
    weight: "2.0",
    realWeight: "2.0",
    length: "25",
    width: "20",
    height: "15",
    volumeWeight: "1.5",
    usedWeight: "2.0",
    packagingType: "bubble_wrap",
    serviceType: "jastip pelni",
    deliveryRoute: "Jakarta → Manokwari",
    shippingRate: "20000",
    price: "40000",
    totalShipping: "40000",
    status: "diserahkan",
    statusPengambilan: "SUDAH_DIAMBIL",
    paymentStatus: "lunas",
    pickedUpAt: new Date(Date.now() - 3600000 * 5),
    adminId: 2,
    packageDate: new Date(),
    createdAt: new Date(Date.now() - 3600000 * 48),
    updatedAt: new Date(),
  },
  {
    id: 5,
    barcode: "JAJ-2026-PKG005",
    resiNumber: "JAJ-005-5590",
    packageNumber: "PK-05",
    customerName: "Bpk. Surya",
    customerPhone: "081255443322",
    customerId: null,
    batchId: 2,
    itemName: "Genset Silent Diesel 5000W Heavy Duty Generator Listrik Industri Manokwari Papua Barat",
    weight: "45.0",
    realWeight: "45.0",
    length: "60",
    width: "50",
    height: "45",
    volumeWeight: "27.0",
    usedWeight: "45.0",
    packagingType: "peti_kayu",
    serviceType: "jastip kargo",
    deliveryRoute: "Surabaya → Manokwari",
    shippingRate: "7000",
    price: "315000",
    totalShipping: "315000",
    status: "tiba",
    statusPengambilan: "BELUM_DIAMBIL",
    paymentStatus: "belum_lunas",
    adminId: 2,
    packageDate: new Date(),
    createdAt: new Date(Date.now() - 3600000 * 18),
    updatedAt: new Date(),
  },
  {
    id: 6,
    barcode: "JAJ-2026-PKG006",
    resiNumber: "JAJ-006-8833",
    packageNumber: "PK-06",
    customerName: "Siti Rahma",
    customerPhone: "081377889900",
    customerId: null,
    batchId: 3,
    itemName: "Kain Batik & Seragam Kantor Pemda Papua Barat Edisi Khusus Lengkap Aksesoris",
    weight: "5.5",
    realWeight: "5.5",
    length: "35",
    width: "25",
    height: "20",
    volumeWeight: "3.5",
    usedWeight: "5.5",
    packagingType: "karton",
    serviceType: "jastip kargo",
    deliveryRoute: "Surabaya → Manokwari",
    shippingRate: "7000",
    price: "38500",
    totalShipping: "38500",
    status: "diserahkan",
    statusPengambilan: "SUDAH_DIAMBIL",
    paymentStatus: "lunas",
    pickedUpAt: new Date(Date.now() - 3600000 * 72),
    adminId: 2,
    packageDate: new Date("2026-06-20"),
    createdAt: new Date(Date.now() - 3600000 * 80),
    updatedAt: new Date(),
  },
  {
    id: 7,
    barcode: "JAJ-2026-PKG007",
    resiNumber: "JAJ-007-9944",
    packageNumber: "PK-07",
    customerName: "Toko Elektronik Sentosa",
    customerPhone: "081122334455",
    customerId: null,
    batchId: 3,
    itemName: "Sparepart Kulkas Showcase & Kompresor Pendingin Ruangan Heavy Duty",
    weight: "18.0",
    realWeight: "18.0",
    length: "50",
    width: "40",
    height: "35",
    volumeWeight: "14.0",
    usedWeight: "18.0",
    packagingType: "kayu",
    serviceType: "jastip kargo",
    deliveryRoute: "Surabaya → Manokwari",
    shippingRate: "7000",
    price: "126000",
    totalShipping: "126000",
    status: "diserahkan",
    statusPengambilan: "SUDAH_DIAMBIL",
    paymentStatus: "lunas",
    pickedUpAt: new Date(Date.now() - 3600000 * 70),
    adminId: 2,
    packageDate: new Date("2026-06-21"),
    createdAt: new Date(Date.now() - 3600000 * 78),
    updatedAt: new Date(),
  },
];

const mockSessions: any[] = [];
const mockTransactions: any[] = [];
const mockPayments: any[] = [];
const mockShifts: any[] = [];
const mockPengeluaran: any[] = [];
const mockVoids: any[] = [];
const mockInvoices: any[] = [];
const mockTarifHistory: any[] = [];
const mockSettings: any[] = [
  { key: "cash_variance_tolerance", value: "0" },
  { key: "tarif_laut_kg", value: "20000" },
  { key: "tarif_udara_kg", value: "77000" },
];

function getStoreForTable(table: any): any[] {
  const tableName = String(table?.[Symbol.for("drizzle:Name")] || table?.name || table || "").toLowerCase();
  if (tableName.includes("user")) return mockUsers;
  if (tableName.includes("shift")) return mockShifts;
  if (tableName.includes("session")) return mockSessions;
  if (tableName.includes("package")) return mockPackages;
  if (tableName.includes("batch")) return mockBatches;
  if (tableName.includes("transaction")) return mockTransactions;
  if (tableName.includes("payment")) return mockPayments;
  if (tableName.includes("pengeluaran")) return mockPengeluaran;
  if (tableName.includes("void")) return mockVoids;
  if (tableName.includes("invoice")) return mockInvoices;
  if (tableName.includes("tarif")) return mockTarifHistory;
  if (tableName.includes("setting")) return mockSettings;
  return [];
}

function evaluateCondition(item: any, condition: any): boolean {
  if (!condition) return true;
  try {
    // 1. Handle Drizzle SQL object (queryChunks)
    if (condition.queryChunks && Array.isArray(condition.queryChunks)) {
      let chunks = condition.queryChunks;
      
      // Unwrap single wrapped SQL like "(" SQL ")"
      if (chunks.length === 3 && chunks[1]?.queryChunks) {
        chunks = chunks[1].queryChunks;
      }

      // Check if this chunk list contains logical operators 'and' / 'or'
      let isLogical = false;
      let hasOr = false;
      const subConditions: any[] = [];
      let currentSub: any[] = [];

      for (const chunk of chunks) {
        const strVal = Array.isArray(chunk?.value)
          ? chunk.value.join("")
          : typeof chunk?.value === "string"
            ? chunk.value
            : "";
        const lower = strVal.toLowerCase();
        if (lower.includes(" and ")) {
          isLogical = true;
          if (currentSub.length > 0) {
            subConditions.push(currentSub.length === 1 && currentSub[0]?.queryChunks ? currentSub[0] : { queryChunks: currentSub });
            currentSub = [];
          }
        } else if (lower.includes(" or ")) {
          isLogical = true;
          hasOr = true;
          if (currentSub.length > 0) {
            subConditions.push(currentSub.length === 1 && currentSub[0]?.queryChunks ? currentSub[0] : { queryChunks: currentSub });
            currentSub = [];
          }
        } else {
          currentSub.push(chunk);
        }
      }

      if (isLogical) {
        if (currentSub.length > 0) {
          subConditions.push(currentSub.length === 1 && currentSub[0]?.queryChunks ? currentSub[0] : { queryChunks: currentSub });
        }
        if (hasOr) {
          return subConditions.some((sc) => evaluateCondition(item, sc));
        }
        return subConditions.every((sc) => evaluateCondition(item, sc));
      }

      // If single nested chunk
      if (chunks.length === 1 && chunks[0]?.queryChunks) {
        return evaluateCondition(item, chunks[0]);
      }

      // Single binary expression in chunks: Column Op Param
      let colName = "";
      let op = "=";
      let targetVal: any = undefined;
      let foundParam = false;

      for (const chunk of chunks) {
        if (chunk?.queryChunks) {
          // Nested sub-expression
          return evaluateCondition(item, chunk);
        }

        if (chunk?.name) {
          colName = chunk.name;
        } else if (chunk?.columnName) {
          colName = chunk.columnName;
        } else if (chunk?.keyAsName) {
          colName = chunk.keyAsName;
        }

        const str = Array.isArray(chunk?.value) ? chunk.value.join("") : (typeof chunk?.value === "string" ? chunk.value : "");
        if (str.includes(" in ")) op = "in";
        else if (str.includes(" = ")) op = "=";
        else if (str.includes(" <> ") || str.includes(" != ")) op = "!=";
        else if (str.includes(" >= ")) op = ">=";
        else if (str.includes(" <= ")) op = "<=";
        else if (str.includes(" > ")) op = ">";
        else if (str.includes(" < ")) op = "<";

        if (Array.isArray(chunk)) {
          targetVal = chunk.map((c: any) => c?.value !== undefined ? c.value : c);
          foundParam = true;
        } else if (chunk?.value !== undefined && !Array.isArray(chunk.value) && chunk.constructor?.name === "Param") {
          targetVal = chunk.value;
          foundParam = true;
        } else if (chunk?.value?.value !== undefined) {
          targetVal = chunk.value.value;
          foundParam = true;
        }
      }

      if (colName && foundParam) {
        const camelCol = colName.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
        const itemVal = item[colName] !== undefined ? item[colName] : item[camelCol];

        if (op === "in" && Array.isArray(targetVal)) {
          return targetVal.some((tv: any) => String(tv).toLowerCase() === String(itemVal).toLowerCase());
        }

        if (targetVal instanceof Date || itemVal instanceof Date) {
          const t1 = new Date(itemVal).getTime();
          const t2 = new Date(targetVal).getTime();
          if (op === "=") return t1 === t2;
          if (op === "!=") return t1 !== t2;
          if (op === ">") return t1 > t2;
          if (op === ">=") return t1 >= t2;
          if (op === "<") return t1 < t2;
          if (op === "<=") return t1 <= t2;
        }

        if (op === "=") {
          return String(itemVal).toLowerCase() === String(targetVal).toLowerCase();
        }
        if (op === "!=") {
          return String(itemVal).toLowerCase() !== String(targetVal).toLowerCase();
        }
        if (op === ">") return Number(itemVal) > Number(targetVal);
        if (op === ">=") return Number(itemVal) >= Number(targetVal);
        if (op === "<") return Number(itemVal) < Number(targetVal);
        if (op === "<=") return Number(itemVal) <= Number(targetVal);
      }
    }

    // 2. Handle drizzle binary operators (eq, ne, gte, lte, gt, lt)
    if (condition.left && condition.right !== undefined) {
      const colName = condition.left.name || condition.left.columnName || String(condition.left);
      const val = condition.right?.value !== undefined ? condition.right.value : condition.right;
      const op = condition.operator || "=";
      const camelCol = colName.replace(/_([a-z])/g, (_: string, g: string) => g.toUpperCase());
      const itemVal = item[colName] !== undefined ? item[colName] : item[camelCol];

      if (op === "=" || op === "eq") {
        return String(itemVal).toLowerCase() === String(val).toLowerCase();
      }
      if (op === "!=" || op === "<>" || op === "ne") {
        return String(itemVal).toLowerCase() !== String(val).toLowerCase();
      }
      if (op === ">" || op === "gt") return Number(itemVal) > Number(val);
      if (op === ">=" || op === "gte") return Number(itemVal) >= Number(val);
      if (op === "<" || op === "lt") return Number(itemVal) < Number(val);
      if (op === "<=" || op === "lte") return Number(itemVal) <= Number(val);
    }

    // 3. Handle drizzle and / or conditions
    if (Array.isArray(condition.conditions)) {
      if (condition.operator === "or") {
        return condition.conditions.some((c: any) => evaluateCondition(item, c));
      }
      return condition.conditions.every((c: any) => evaluateCondition(item, c));
    }
  } catch {
    // Ignore and match by default
  }
  return true;
}

function createMockChain(getData: () => any[], tableRef?: any, selectFields?: any) {
  let currentFilter: any = null;
  let currentLimit: number | null = null;
  let currentOffset: number | null = null;

  const chain: any = {
    from: (table: any) => {
      const store = getStoreForTable(table);
      return createMockChain(() => {
        if (selectFields && typeof selectFields === "object" && "batch" in selectFields) {
          return store.map((b) => ({
            batch: b,
            packageCount: mockPackages.filter((p) => p.batchId === b.id).length,
          }));
        }
        return store;
      }, table, selectFields);
    },
    where: (condition: any) => {
      currentFilter = condition;
      return createMockChain(() => {
        const raw = getData();
        return raw.filter((item) => evaluateCondition(item, currentFilter));
      }, tableRef, selectFields);
    },
    limit: (n: number) => {
      currentLimit = n;
      return createMockChain(() => {
        const data = getData();
        return currentLimit != null ? data.slice(0, currentLimit) : data;
      }, tableRef, selectFields);
    },
    offset: (n: number) => {
      currentOffset = n;
      return createMockChain(() => {
        const data = getData();
        return currentOffset != null ? data.slice(currentOffset) : data;
      }, tableRef, selectFields);
    },
    orderBy: () => chain,
    groupBy: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    rightJoin: () => chain,
    returning: () => chain,
    for: () => chain,
    onConflictDoNothing: () => chain,
    onConflictDoUpdate: () => chain,
    set: (data: any) => {
      const store = getStoreForTable(tableRef);
      return createMockChain(() => {
        const results: any[] = [];
        store.forEach((item, idx) => {
          if (evaluateCondition(item, currentFilter)) {
            store[idx] = { ...item, ...data, updatedAt: new Date() };
            results.push(store[idx]);
          }
        });
        return results.length > 0 ? results : [data];
      }, tableRef);
    },
    values: (data: any) => {
      const store = getStoreForTable(tableRef);
      const items = Array.isArray(data) ? data : [data];
      const inserted = items.map((item, idx) => {
        if (item?.key !== undefined) {
          const existIdx = store.findIndex((s: any) => s.key === item.key);
          if (existIdx >= 0) {
            store[existIdx] = { ...store[existIdx], ...item, updatedAt: new Date() };
            return store[existIdx];
          }
        }
        const record = {
          id: Date.now() + idx,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...item,
        };
        store.push(record);
        return record;
      });
      return createMockChain(() => inserted, tableRef);
    },
    then: (onfulfilled?: any, onrejected?: any) => {
      return Promise.resolve(getData()).then(onfulfilled, onrejected);
    },
    catch: (onrejected?: any) => {
      return Promise.resolve(getData()).catch(onrejected);
    },
    finally: (onfinally?: any) => {
      return Promise.resolve(getData()).finally(onfinally);
    },
  };
  return chain;
}

function createMockDb() {
  const mockDb: any = {
    select: (fields?: any) => createMockChain(() => [], undefined, fields),
    insert: (table: any) => ({
      values: (data: any) => {
        const store = getStoreForTable(table);
        const items = Array.isArray(data) ? data : [data];
        const inserted = items.map((item, idx) => {
          if (item?.key !== undefined) {
            const existIdx = store.findIndex((s: any) => s.key === item.key);
            if (existIdx >= 0) {
              store[existIdx] = { ...store[existIdx], ...item, updatedAt: new Date() };
              return store[existIdx];
            }
          }
          const record = {
            id: Date.now() + idx,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...item,
          };
          store.push(record);
          return record;
        });
        return createMockChain(() => inserted, table);
      },
    }),
    update: (table: any) => ({
      set: (data: any) => {
        const store = getStoreForTable(table);
        return {
          where: (condition: any) =>
            createMockChain(() => {
              const results: any[] = [];
              store.forEach((item, idx) => {
                if (evaluateCondition(item, condition)) {
                  store[idx] = { ...item, ...data, updatedAt: new Date() };
                  results.push(store[idx]);
                }
              });
              return results;
            }, table),
        };
      },
    }),
    delete: (table: any) => ({
      where: (condition: any) =>
        createMockChain(() => {
          const store = getStoreForTable(table);
          const deleted: any[] = [];
          for (let i = store.length - 1; i >= 0; i--) {
            if (evaluateCondition(store[i], condition)) {
              deleted.push(store.splice(i, 1)[0]);
            }
          }
          return deleted;
        }, table),
    }),
    execute: async () => ({ rows: [] }),
    transaction: async (callback: any) => callback(mockDb),
    query: new Proxy(
      {},
      {
        get: (_target, prop) => ({
          findMany: async (args?: any) => {
            const store = getStoreForTable(prop);
            if (args?.where) return store.filter((item) => evaluateCondition(item, args.where));
            return store;
          },
          findFirst: async (args?: any) => {
            const store = getStoreForTable(prop);
            if (args?.where) return store.find((item) => evaluateCondition(item, args.where)) || null;
            return store[0] || null;
          },
          create: async (d: any) => d?.data ?? {},
          update: async (d: any) => d?.data ?? {},
          delete: async () => ({}),
        }),
      }
    ),
    _isMock: true,
  };

  return mockDb;
}

let pool: any;
let db: any;

const pgConnectionString =
  process.env.DATABASE_URL ||
  (process.env.PGHOST
    ? `postgresql://${process.env.PGUSER || "postgres"}:${encodeURIComponent(process.env.PGPASSWORD || "")}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || "postgres"}`
    : undefined);

if (pgConnectionString) {
  try {
    const pg = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = (pg as any).default || pg;
    const testPool = new Pool({ connectionString: pgConnectionString, connectionTimeoutMillis: 1000 });
    await testPool.query("SELECT 1");
    pool = testPool;
    db = drizzle(pool, { schema });
    console.log("[JAJ Database] Connected to PostgreSQL instance via Drizzle ORM");
  } catch (err) {
    console.warn("[JAJ Database] PostgreSQL connection error, falling back to mock database:", err);
    db = createMockDb();
    pool = {
      query: async () => ({ rows: [] }),
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
      on: () => {},
      end: async () => {},
    };
  }
} else {
  console.log("[JAJ Database] Running with active in-memory PostgreSQL store");
  db = createMockDb();
  pool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    on: () => {},
    end: async () => {},
  };
}

export { pool, db };
export * from "./schema";

