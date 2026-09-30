import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "./connection";

/**
 * Applies schema.sql to the database. Idempotent: schema.sql uses
 * CREATE TABLE IF NOT EXISTS, so it's safe to run repeatedly.
 */
async function migrate(): Promise<void> {
    const schemaPath = join(__dirname, "schema.sql");
    const sql = readFileSync(schemaPath, "utf8");

    console.log("Running schema migration...");
    await pool.query(sql);
    console.log("Migration complete.");
}

migrate()
    .catch((err) => {
        console.error("Migration failed:", err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
