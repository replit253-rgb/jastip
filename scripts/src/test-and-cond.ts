import { eq, and, gt } from "drizzle-orm";
import { sessionsTable } from "@workspace/db/schema";

const cond: any = and(eq(sessionsTable.token, "token123"), gt(sessionsTable.expiresAt, new Date()));
console.log("and cond keys:", Object.keys(cond));
console.log("queryChunks length:", cond.queryChunks?.length);
const nested = cond.queryChunks[1];
console.log("nested queryChunks length:", nested.queryChunks?.length);
nested.queryChunks?.forEach((c: any, i: number) => {
  console.log(`Nested Chunk ${i}:`, c.constructor?.name, c?.name, c?.value, c?.queryChunks ? "IS NESTED SQL" : "");
});

