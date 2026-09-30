import "dotenv/config";
import { Pool } from "pg";

/**
 * A single shared Postgres connection pool for the whole app.
 * Import { pool } anywhere you need to run a query.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is missing. Add it to your .env file.");
}

export const pool = new Pool({ connectionString });

// Surface unexpected errors on idle clients instead of crashing silently.
pool.on("error", (err) => {
    console.error("Unexpected Postgres pool error:", err);
});
