// server.js (sm-api) - FULL minimal working
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
const PORT = process.env.PORT || 3000;

// allowed origins (prod domain + netlify preview ekleyebilirsin)
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
   CORS + PARSERS
========================= */
app.use(
    cors({
        origin(origin, cb) {
            // curl/postman (no origin) allow
            if (!origin) return cb(null, true);
            if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
            return cb(new Error("CORS blocked: " + origin));
        },
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
        methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    })
);

// preflight
app.options("*", (req, res) => res.sendStatus(204));

// JSON limit (post create)
app.use(express.json({ limit: "1mb" }));

/* =========================
   STATIC UPLOADS (disk)
========================= */
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// public file serving (image url döndürmek için)
app.use("/uploads", express.static(UPLOAD_DIR));

/* =========================
   MULTER (multipart upload)
========================= */
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
        const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
        const name = `analysis_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`;
        cb(null, name);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB server limit (nginx'i de aç!)
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) return cb(new Error("Only images allowed"));
        cb(null, true);
    },
});

/* =========================
   ROUTES
========================= */
app.get("/health", (_req, res) => res.json({ ok: true }));

// 1) Upload image
app.post("/api/upload/analysis-image", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

    // public URL (nginx domainin bu ise)
    const publicUrl = `https://api.chriontoken.com/uploads/${req.file.filename}`;
    res.json({ ok: true, url: publicUrl });
});

// 2) Create post
app.post("/api/posts", async (req, res) => {
    try {
        const { title = "", content = "", tags = [], image_url = null, imageUrl = null } = req.body || {};
        const img = image_url || imageUrl || null;

        if (!String(title).trim() && !String(content).trim()) {
            return res.status(400).json({ ok: false, error: "title or content required" });
        }

        // TODO: auth eklenecek. Şimdilik user_id fake / null.
        // Senin tablona göre alan adlarını ayarla:
        const q = `
      INSERT INTO posts (title, content, tags, image_url)
      VALUES ($1, $2, $3, $4)
      RETURNING id, title, content, tags, image_url, created_at
    `;
        const vals = [
            String(title).trim(),
            String(content).trim(),
            Array.isArray(tags) ? tags : [],
            img,
        ];

        const { rows } = await pool.query(q, vals);
        res.json(rows[0]);
    } catch (e) {
        console.error("create post error:", e);
        res.status(500).json({ ok: false, error: "server_error" });
    }
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
    console.log(`✅ sm-api running on :${PORT}`);
});
