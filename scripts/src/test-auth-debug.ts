import { db, usersTable } from "@workspace/db";
import crypto from "crypto";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "jaj_salt_2024").digest("hex");
}

async function test() {
  const allUsers = await db.select().from(usersTable);
  console.log("All users in DB:", allUsers.map((u: any) => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, pass: u.password })));
  console.log("Hash of admin123:", hashPassword("admin123"));
  console.log("Hash of owner123:", hashPassword("owner123"));
}

test();
