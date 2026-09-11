import { eq } from "drizzle-orm";
import { usersTable } from "@workspace/db/schema";

const cond: any = eq(usersTable.phone, "081200000001");
console.log("queryChunks length:", cond.queryChunks.length);
cond.queryChunks.forEach((chunk: any, i: number) => {
  console.log(`Chunk ${i}:`, chunk.constructor?.name, chunk?.name, chunk?.value, chunk?.value?.value, chunk?.strings);
});


