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

const mockSessions: any[] = [];
const mockPackages: any[] = [];
const mockBatches: any[] = [];
const mockSettings: any[] = [
  { key: "cash_variance_tolerance", value: "0" },
];

function createMockChain(getData: () => any[]) {
  const chain: any = {
    from: (table: any) => {
      const tableName = table?.[Symbol.for("drizzle:Name")] || table?.name || "";
      if (tableName.includes("user")) return createMockChain(() => mockUsers);
      if (tableName.includes("session")) return createMockChain(() => mockSessions);
      if (tableName.includes("package")) return createMockChain(() => mockPackages);
      if (tableName.includes("batch")) return createMockChain(() => mockBatches);
      if (tableName.includes("setting")) return createMockChain(() => mockSettings);
      return createMockChain(() => []);
    },
    where: () => chain,
    limit: (n: number) => createMockChain(() => getData().slice(0, n)),
    offset: (n: number) => createMockChain(() => getData().slice(n)),
    orderBy: () => chain,
    groupBy: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    rightJoin: () => chain,
    returning: () => chain,
    onConflictDoNothing: () => chain,
    onConflictDoUpdate: () => chain,
    set: (data: any) => chain,
    values: (data: any) => {
      const items = Array.isArray(data) ? data : [data];
      const inserted = items.map((item, idx) => ({ id: Date.now() + idx, createdAt: new Date(), ...item }));
      items.forEach((item) => {
        if (item.token && item.userId) mockSessions.push(item);
      });
      return createMockChain(() => inserted);
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
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: any) => d?.data ?? {},
    update: async (d: any) => d?.data ?? {},
    delete: async () => ({}),
  };

  const mockDb: any = {
    select: (_fields?: any) => createMockChain(() => []),
    insert: (table: any) => {
      const tableName = table?.[Symbol.for("drizzle:Name")] || table?.name || "";
      return {
        values: (data: any) => {
          const items = Array.isArray(data) ? data : [data];
          const inserted = items.map((item, idx) => ({ id: Date.now() + idx, createdAt: new Date(), ...item }));
          if (tableName.includes("session")) {
            items.forEach((item) => mockSessions.push(item));
          } else if (tableName.includes("package")) {
            items.forEach((item) => mockPackages.push(item));
          }
          return createMockChain(() => inserted);
        },
      };
    },
    update: (_table: any) => ({
      set: (data: any) => createMockChain(() => [data]),
    }),
    delete: (_table: any) => createMockChain(() => []),
    execute: async () => ({ rows: [] }),
    transaction: async (callback: any) => callback(mockDb),
    query: new Proxy({}, { get: () => noOp }),
    _isMock: true,
  };

  return mockDb;
}

let pool: any;
let db: any;

if (process.env.DATABASE_URL) {
  try {
    const pg = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = (pg as any).default || pg;
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
  } catch (err) {
    console.warn("[AI Studio] Database connection failed, using mock:", err);
    db = createMockDb();
    pool = {
      query: async () => ({ rows: [] }),
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
      on: () => {},
      end: async () => {},
    };
  }
} else {
  console.warn("[AI Studio] DATABASE_URL not set — using in-memory mock database");
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

