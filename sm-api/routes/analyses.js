// /sm-api/routes/analyses.js
import express from "express";
import { pool } from "../db.js";
import { getBearer, getAppwriteUserFromJwt } from "../lib/appwrite-user.js";

const router = express.Router();
router.use(express.json());

// ✅ AUTH middleware (JWT mandatory)
async function requireUser(req, res, next) {
    try {
        const jwt = getBearer(req);
        if (!jwt) return res.status(401).json({ ok: false, error: "Missing Authorization Bearer JWT" });

        const user = await getAppwriteUserFromJwt(jwt);
        req.user = user; // { $id, email, name ... }
        next();
    } catch (e) {
        return res.status(401).json({ ok: false, error: e?.message || "Invalid JWT" });
    }
}

/* =========================================================
   POST /api/analyses/create
   - UUID author_id must reference users(id)
   - Appwrite uid (string) -> users.appwrite_uid -> users.id (uuid)
========================================================= */
router.post("/create", requireUser, async (req, res) => {
    try {
        const appwrite_uid = String(req.user?.$id || "").trim();
        if (!appwrite_uid) return res.status(401).json({ ok: false, error: "Auth user missing id" });

        const market = String(req.body?.market || "").trim();
        const category = String(req.body?.category || "General").trim();
        const timeframe = String(req.body?.timeframe || "").trim();
        const content = String(req.body?.content || "").trim();

        // pairs can be array OR comma string
        let pairs = req.body?.pairs;
        if (typeof pairs === "string") {
            pairs = pairs.split(",").map((s) => s.trim()).filter(Boolean);
        }
        if (!Array.isArray(pairs)) pairs = [];
        pairs = pairs.map((x) => String(x).trim()).filter(Boolean);

        const image_path = String(req.body?.image_path || "").trim();

        if (!market) return res.status(400).json({ ok: false, error: "market required" });
        if (!timeframe) return res.status(400).json({ ok: false, error: "timeframe required" });
        if (!pairs.length) return res.status(400).json({ ok: false, error: "pairs required" });
        if (!content) return res.status(400).json({ ok: false, error: "content required" });
        if (!image_path) return res.status(400).json({ ok: false, error: "image_path required" });

        // ✅ map appwrite uid -> users.id (uuid)
        const ur = await pool.query(`SELECT id FROM users WHERE appwrite_uid = $1 LIMIT 1`, [appwrite_uid]);
        const author_uuid = ur.rows?.[0]?.id;

        if (!author_uuid) {
            return res.status(400).json({
                ok: false,
                error: "user_not_found",
                detail: "No row in users for this appwrite_uid. Ensure login/ensure_profile inserts users(appwrite_uid).",
            });
        }

        const q = await pool.query(
            `
      INSERT INTO analyses (author_id, market, category, timeframe, content, pairs, image_path)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, author_id, market, category, timeframe, content, pairs, image_path, created_at
      `,
            [author_uuid, market, category, timeframe, content, pairs, image_path]
        );

        return res.json({ ok: true, analysis: q.rows[0] });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || String(e) });
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
        return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});

/* =========================================================
   GET /api/analyses/:id/likes_count
========================================================= */
router.get("/:id/likes_count", async (req, res) => {
    try {
        const id = String(req.params?.id || "").trim();
        if (!id) return res.status(400).json({ ok: false, error: "id required" });

        const q = await pool.query(
            `
      SELECT COUNT(*)::int AS likes_count
      FROM interactions
      WHERE post_id = $1 AND kind = 'like'
      `,
            [id]
        );

        return res.json({ ok: true, likes_count: q.rows?.[0]?.likes_count ?? 0 });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});

/* =========================================================
   GET /api/analyses/:id  (view.js için)
========================================================= */
router.get("/:id", async (req, res) => {
    try {
        const id = String(req.params?.id || "").trim();
        if (!id) return res.status(400).json({ ok: false, error: "id required" });

        const q = await pool.query(
            `
      SELECT id, author_id, market, category, timeframe, content, pairs, image_path, created_at
      FROM analyses
      WHERE id = $1
      LIMIT 1
      `,
            [id]
        );

        const row = q.rows?.[0];
        if (!row) return res.status(404).json({ ok: false, error: "Not found" });

        return res.json({ ok: true, analysis: row });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});

export default router;
