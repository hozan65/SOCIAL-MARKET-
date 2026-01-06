// /opt/sm-api/server.js (FINAL - uploads + analyses feed + news feed + JWT userId fix)
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { Pool } from "pg";

const app = express();

/* =========================
   ENV
========================= */
const PORT = Number(process.env.PORT || 3002);
const PUBLIC_API = process.env.PUBLIC_API || "https://api.chriontoken.com";

const ALLOWED_ORIGINS = [
    "https://chriontoken.com",
    "https://www.chriontoken.com",
];

// Postgres
const pool = new Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "socialmarket",
    user: process.env.PGUSER || "sm_admin",
    password: process.env.PGPASSWORD || "",
    ssl: process.env.PGSSL === "1" ? { rejectUnauthorized: false } : false,
});

/* =========================
   HELPERS
========================= */
async function q(sql, params = []) {
    return pool.query(sql, params);
}

function getBearer(req) {
    const h = String(req.header("Authorization") || "").trim();
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : "";
}

// ✅ decode JWT payload (NO VERIFY) — hızlı fix
function decodeJwtPayload(jwt) {
    try {
        const part = jwt.split(".")[1];
        if (!part) return null;
        const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
        const json = Buffer.from(b64, "base64").toString("utf8");
        return JSON.parse(json);
    } catch {
        return null;
    }
}

/* =========================
   CORS + PARSERS
========================= */
app.use(
    cors({
        origin(origin, cb) {
            if (!origin) return cb(null, true);
            if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
            return cb(new Error("CORS blocked: " + origin));
        },
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
);

app.options(/.*/, (_req, res) => res.sendStatus(204));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================
   STATIC UPLOADS (disk)
========================= */
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOAD_DIR));

/* =========================
   MULTER
========================= */
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = (path.extname(file.originalname || "") || ".jpg").toLowerCase();
        const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
        const name = `analysis_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`;
        cb(null, name);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype?.startsWith("image/")) return cb(new Error("Only images allowed"));
        cb(null, true);
    },
});

/* =========================
   ROUTES
========================= */
app.get("/health", (_req, res) => res.json({ ok: true, ver: "sm-api-3002-v3" }));

// Upload image (FormData field: "file")
app.post("/api/upload/analysis-image", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

    // URL döndür (frontend bunu kullanıyor)
    const publicUrl = `${PUBLIC_API}/uploads/${req.file.filename}`;

    // istersen path de döndür: /uploads/xxx.jpg
    res.json({ ok: true, url: publicUrl, path: `/uploads/${req.file.filename}` });
});

/* =========================
   ANALYSES
========================= */

// ✅ Create analysis
// JWT payload: { userId: "<appwrite_user_id>", ... }
app.post("/api/analyses/create", async (req, res) => {
    try {
        const jwt = getBearer(req);
        if (!jwt) return res.status(401).json({ ok: false, error: "missing_author" });

        const payload = decodeJwtPayload(jwt);
        const appwrite_uid = String(payload?.userId || "").trim(); // ✅ senin JWT burada taşıyor
        if (!appwrite_uid) return res.status(401).json({ ok: false, error: "missing_author" });

        // ✅ map Appwrite userId(text) -> users.id(uuid)
        const ur = await q(`SELECT id FROM users WHERE appwrite_uid = $1 LIMIT 1`, [appwrite_uid]);
        const author_uuid = ur.rows?.[0]?.id;

        if (!author_uuid) {
            return res.status(400).json({
                ok: false,
                error: "user_not_found",
                detail: "No users row for this appwrite_uid",
            });
        }

        const market = String(req.body?.market || "").trim();
        const timeframe = String(req.body?.timeframe || "").trim();
        const title = String(req.body?.title || "").trim();
        const category = String(req.body?.category || "General").trim();
        const content = String(req.body?.content || "").trim();

        let pairs = req.body?.pairs;
        if (typeof pairs === "string") pairs = pairs.split(",").map((s) => s.trim()).filter(Boolean);
        if (!Array.isArray(pairs)) pairs = [];
        pairs = pairs.map((x) => String(x).trim()).filter(Boolean);

        const image_path = String(req.body?.image_path || "").trim();

        if (!market) return res.status(400).json({ ok: false, error: "market required" });
        if (!timeframe) return res.status(400).json({ ok: false, error: "timeframe required" });
        if (!content) return res.status(400).json({ ok: false, error: "content required" });
        if (!pairs.length) return res.status(400).json({ ok: false, error: "pairs required" });
        if (!image_path) return res.status(400).json({ ok: false, error: "image_path required" });

        const r = await q(
            `INSERT INTO analyses (author_id, market, category, timeframe, content, pairs, image_path)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, author_id, market, category, timeframe, content, pairs, image_path, created_at`,
            [author_uuid, market, category, timeframe, content, pairs, image_path]
        );

        res.json({ ok: true, analysis: r.rows[0] });
    } catch (e) {
        console.error("analyses/create error:", e);
        res.status(500).json({ ok: false, error: "create_failed", detail: String(e?.message || e) });
    }
});

// Feed list
app.get("/api/analyses", async (req, res) => {
    try {
        const limit = Math.min(50, Math.max(1, Number(req.query.limit || 6)));
        const offset = Math.max(0, Number(req.query.offset || 0));

        const r = await q(
            `SELECT id, author_id, market, category, timeframe, content, pairs, image_path, created_at
       FROM analyses
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.json({ ok: true, items: r.rows, limit, offset });
    } catch (e) {
        console.error("analyses list error:", e);
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

// Like count (placeholder)
app.get("/api/analyses/:id/likes_count", async (_req, res) => {
    res.json({ ok: true, likes_count: 0 });
});

/* =========================
   NEWS
========================= */
app.get("/api/news", async (req, res) => {
    try {
        const limit = Math.min(50, Math.max(1, Number(req.query.limit || 6)));

        const r = await q(
            `SELECT id, title, image_url, url, source, created_at
       FROM news
       ORDER BY created_at DESC
       LIMIT $1`,
            [limit]
        );

        res.json({ ok: true, items: r.rows, limit });
    } catch (e) {
        console.error("news list error:", e);
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
    console.log(`✅ sm-api running on :${PORT}`);
});
