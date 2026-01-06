// /sm-api/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";

import analysesRouter from "./routes/analyses.js";

const app = express();

/* =========================
   ENV
========================= */
const PORT = Number(process.env.PORT || 3002);
const PUBLIC_API = (process.env.PUBLIC_API || "https://api.chriontoken.com").trim();

const ALLOWED_ORIGINS = [
    "https://chriontoken.com",
    "https://www.chriontoken.com",
];

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
app.get("/health", (_req, res) => res.json({ ok: true, ver: "sm-api-3002-v4-authfix" }));

// Upload image (FormData field: "file")
app.post("/api/upload/analysis-image", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: "file_required" });

    const publicUrl = `${PUBLIC_API}/uploads/${req.file.filename}`;
    res.json({ ok: true, url: publicUrl, path: `/uploads/${req.file.filename}` });
});

// ✅ Analyses routes (create + list)
app.use("/api/analyses", analysesRouter);

/* =========================
   START
========================= */
app.listen(PORT, () => {
    console.log(`✅ sm-api running on :${PORT}`);
});
