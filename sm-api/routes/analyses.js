// /sm-api/routes/analyses.js
import express from "express";
import { pool } from "../db.js";
import { getBearer, getAppwriteUserFromJwt } from "../lib/appwrite-user.js";

const router = express.Router();
router.use(express.json({ limit: "2mb" }));

// ✅ AUTH middleware (JWT mandatory)
async function requireUser(req, res, next) {
    try {
        const jwt = getBearer(req);
        if (!jwt) return res.status(401).json({ ok: false, error: "missing_author" }); // frontend buna bakıyor

        const user = await getAppwriteUserFromJwt(jwt);
        req.user = user; // { $id, email, name ... }
        next();
    } catch (e) {
        return res.status(401).json({ ok: false, error: "invalid_jwt", detail: String(e?.message || e) });
    }
}

/* =========================================================
   POST /api/analyses/create
   - author_id: users.id (uuid)
   - appwrite uid: req.user.$id  -> users.appwrite_uid -> users.id
========================================================= */
router.post("/create", requireUser, async (req, res) => {
    try {
        const appwrite_uid = String(req.user?.$id || "").trim();
        if (!appwrite_uid) return res.status(401).json({ ok: false, error: "missing_author" });

        const market = String(req.body?.market || "").trim();
        const category = String(req.body?.category || "General").trim();
        const timeframe = String(req.body?.timeframe || "").trim();
        const content = String(req.body?.content || "").trim();

        // pairs can be array OR comma string
        let pairs = req.body?.pairs;
        if (typeof pairs === "string") pairs = pairs.split(",").map((s) => s.trim()).filter(Boolean);
        if (!Array.isArray(pairs)) pairs = [];
        pairs = pairs.map((x) => String(x).trim()).filter(Boolean);

        const image_path = String(req.body?.image_path || "").trim();

        if (!market) return res.status(400).json({ ok: false, error: "market_required" });
        if (!timeframe) return res.status(400).json({ ok: false, error: "timeframe_required" });
        if (!pairs.length) return res.status(400).json({ ok: false, error: "pairs_required" });
        if (!content) return res.status(400).json({ ok: false, error: "content_required" });
        if (!image_path) return res.status(400).json({ ok: false, error: "image_path_required" });

        // ✅ map appwrite uid -> users.id (uuid)
        const ur = await pool.query(`SELECT id FROM users WHERE appwrite_uid = $1 LIMIT 1`, [appwrite_uid]);
        const author_uuid = ur.rows?.[0]?.id;

        if (!author_uuid) {
            return res.status(400).json({
                ok: false,
                error: "user_not_found",
                detail:
                    "No row in users for this appwrite_uid. Ensure ensure_profile inserts users(appwrite_uid) after login.",
            });
        }

        const ins = await pool.query(
            `
      INSERT INTO analyses (author_id, market, category, timeframe, content, pairs, image_path)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, author_id, market, category, timeframe, content, pairs, image_path, created_at
      `,
            [author_uuid, market, category, timeframe, content, pairs, image_path]
        );

        return res.json({ ok: true, analysis: ins.rows[0] });
    } catch (e) {
        console.error("analyses/create error:", e);
        return res.status(500).json({ ok: false, error: "create_failed", detail: String(e?.message || e) });
    }
});

/* =========================================================
   GET /api/analyses?limit=10&offset=0
========================================================= */
router.get("/", async (req, res) => {
    try {
        const limit = Math.min(50, Math.max(1, Number(req.query?.limit || 10) || 10));
        const offset = Math.max(0, Number(req.query?.offset || 0) || 0);

        const q = await pool.query(
            `
      SELECT id, author_id, market, category, timeframe, content, pairs, image_path, created_at
      FROM analyses
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
      `,
            [limit, offset]
        );

        return res.json({ ok: true, items: q.rows, limit, offset });
    } catch (e) {
        return res.status(500).json({ ok: false, error: "list_failed", detail: String(e?.message || e) });
    }
});

export default router;
