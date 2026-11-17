import { db } from "../index.js";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Applying custom_permissions column to users table...");

  await db.execute(sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS custom_permissions jsonb;
  `);

  console.log("Column custom_permissions verified/added successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
