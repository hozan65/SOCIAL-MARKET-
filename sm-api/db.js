import { Pool } from "pg";

export const pool = new Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "socialmarket",
    user: process.env.PGUSER || "sm_admin",
    password: process.env.PGPASSWORD || "",
    ssl: process.env.PGSSL === "1" ? { rejectUnauthorized: false } : false,
});
