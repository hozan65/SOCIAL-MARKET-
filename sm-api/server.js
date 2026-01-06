// /opt/sm-api/server.js (FINAL - uploads + analyses feed + news feed)
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
const PORT = Number(process.env.PORT || 3002); // ✅ nginx proxy ile uyumlu
const PUBLIC_API = process.env.PUBLIC_API || "https://api.chriontoken.com";

// allowed origins
const ALLOWED_ORIGINS = [
    "https://chriontoken.com",
    "https://www.chriontoken.com",
];

// Postgres (Hetzner)
const pool = new Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "socialmarket",
    user: process.env.PGUSER || "sm_admin",
    password: process.env.PGPASSWORD || "",
    ssl: process.env.PGSSL === "1" ? { rejectUnauthorized: false } : false,
});

/* =========================
   CORS + PARSERS  ✅ FIXED
========================= */
const corsMw = cors({
    origin(origin, cb) {
        // curl/postman (no origin) allow
        if (!origin) return cb(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-User-Id", "x-user-id"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

app.use(corsMw);
app.options(/.*/, corsMw); // ✅ preflight CORS ile doğru header’ları döner

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================
   STATIC UPLOADS (disk)
========================= */
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// public file serving
app.use("/uploads", express.static(UPLOAD_DIR));

/* =========================
   MULTER (multipart upload)
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
    limits: { fileSize: 15 * 1024 * 1024 }, // ✅ 15MB
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype?.startsWith("image/")) return cb(new Error("Only images allowed"));
        cb(null, true);
    },
});

/* =========================
   HELPERS
========================= */
async function q(sql, params = []) {
    return pool.query(sql, params);
}

// helper: uid (both cases)
function getUid(req) {
    return String(req.header("x-user-id") || req.header("X-User-Id") || "").trim();
}

function getBearer(req) {
    const h = String(req.header("Authorization") || "").trim();
    if (!h) return "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : "";
}

// ✅ Appwrite JWT verify endpoint (Appwrite Cloud kullanıyorsan endpoint farklıysa senin mevcut lib’in neyse onu kullan)
// Eğer sende zaten getAppwriteUserFromJwt varsa bunu kullanma, onu çağır.
async function getAppwriteUserFromJwt(jwt) {
    // Bu fonksiyon sende başka dosyada vardıysa (lib/appwrite-user.js),
    // aynısını burada tekrar etme. Direkt import edip kullan.
    throw new Error("getAppwriteUserFromJwt is not wired in server.js yet");
}

/* =========================
   ROUTES
========================= */
app.get("/health", (_req, res) => res.json({ ok: true }));

// 1) Upload image (FormData field: "file")
app.post("/api/upload/analysis-image", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

    const publicUrl = `${PUBLIC_API}/uploads/${req.file.filename}`;
    res.json({ ok: true, url: publicUrl });
});

/* =========================
   ANALYSES
========================= */

// Create analysis
// Header: X-User-Id (author_id)
app.post("/api/analyses/create", async (req, res) => {
    try {
        const author_id = getUid(req);

        const market = String(req.body?.market || "").trim();
        const timeframe = String(req.body?.timeframe || "").trim();
        const title = String(req.body?.title || "").trim();
        const category = String(req.body?.category || "").trim();
        const content = String(req.body?.content || "").trim();
        const pairs = Array.isArray(req.body?.pairs) ? req.body.pairs : [];
        const image_path = req.body?.image_path ? String(req.body.image_path).trim() : null;

        if (!author_id) return res.status(401).json({ ok: false, error: "Missing X-User-Id" });
        if (!market) return res.status(400).json({ ok: false, error: "market required" });
        if (!timeframe) return res.status(400).json({ ok: false, error: "timeframe required" });
        if (!content) return res.status(400).json({ ok: false, error: "content required" });
        if (!pairs.length) return res.status(400).json({ ok: false, error: "pairs required" });

        const r = await q(
            `INSERT INTO analyses (author_id, market, timeframe, title, category, content, pairs, image_path)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, author_id, market, timeframe, title, category, content, pairs, image_path, created_at`,
            [author_id, market, timeframe, title || null, category || null, content, pairs, image_path]
        );

        res.json({ ok: true, analysis: r.rows[0] });
    } catch (e) {
        console.error("analyses/create error:", e);
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

// Feed list
app.get("/api/analyses", async (req, res) => {
    try {
        const limit = Math.min(50, Math.max(1, Number(req.query.limit || 6)));
        const offset = Math.max(0, Number(req.query.offset || 0));

        const r = await q(
            `SELECT id, author_id, market, timeframe, title, category, content, pairs, image_path, created_at
       FROM analyses
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.json({ list: r.rows, limit, offset });
    } catch (e) {
        console.error("analyses list error:", e);
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

// Like count endpoint placeholder
app.get("/api/analyses/:id/likes_count", async (_req, res) => {
    res.json({ likes_count: 0 });
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

        res.json({ list: r.rows, limit });
    } catch (e) {
        console.error("news list error:", e);
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

/* =========================
   DM INBOX (Postgres)
========================= */
app.get("/api/dm/inbox", async (req, res) => {
    try {
        const uid = getUid(req);
        if (!uid) return res.status(401).json({ ok: false, error: "Missing X-User-Id" });

        const convosR = await q(
            `
      SELECT id, user1_id, user2_id, updated_at, created_at
      FROM conversations
      WHERE user1_id = $1 OR user2_id = $1
      ORDER BY COALESCE(updated_at, created_at) DESC
      `,
            [uid]
        );

        const convos = convosR.rows || [];
        if (!convos.length) return res.json({ ok: true, list: [] });

        const convoIds = convos.map((c) => c.id);

        const msgsR = await q(
            `
      SELECT DISTINCT ON (conversation_id)
        conversation_id, body, created_at
      FROM messages
      WHERE conversation_id = ANY($1::uuid[])
      ORDER BY conversation_id, created_at DESC
      `,
            [convoIds]
        );

        const lastByConvo = new Map((msgsR.rows || []).map((m) => [m.conversation_id, m]));

        const peerIds = convos.map((c) => (c.user1_id === uid ? c.user2_id : c.user1_id));

        const profR = await q(
            `
      SELECT appwrite_user_id, name, avatar_url
      FROM profiles
      WHERE appwrite_user_id = ANY($1::uuid[])
      `,
            [peerIds]
        );

        const profByUid = new Map((profR.rows || []).map((p) => [p.appwrite_user_id, p]));

        const list = convos.map((c) => {
            const peer_id = c.user1_id === uid ? c.user2_id : c.user1_id;
            const prof = profByUid.get(peer_id);
            const last = lastByConvo.get(c.id);

            return {
                conversation_id: c.id,
                peer_id,
                peer_name: prof?.name || "Unknown user",
                peer_avatar: prof?.avatar_url || null,
                last_message: last?.body ? String(last.body) : "",
                last_at: last?.created_at || c.updated_at || c.created_at || null,
            };
        });

        res.json({ ok: true, list });
    } catch (e) {
        console.error("dm/inbox error:", e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
    console.log(`✅ sm-api running on :${PORT}`);
});
