// routes/follows.js
import express from "express";

export default function followsRoutes(pool) {
    const r = express.Router();

    // ---------- helpers ----------
    function getUid(req) {
        return String(req.header("x-user-id") || req.header("X-User-Id") || "").trim();
    }

    function toInt(v, def, min, max) {
        const n = Number.parseInt(String(v ?? ""), 10);
        const x = Number.isFinite(n) ? n : def;
        return Math.max(min, Math.min(max, x));
    }

    // ---------- auth guard ----------
    r.use((req, res, next) => {
        // public list endpoints için uid query var ama toggle/is-following için header şart
        // burada sadece toggle/is-following gibi endpointlerde zorlayacağız.
        req._uid = getUid(req);
        next();
    });

    // GET /api/follows/is-following?target=UID
    r.get("/is-following", async (req, res) => {
        try {
            const uid = req._uid;
            const target = String(req.query.target || "").trim();

            if (!uid) return res.status(401).json({ ok: false, error: "Missing X-User-Id" });
            if (!target) return res.status(400).json({ ok: false, error: "Missing target" });
            if (uid === target) return res.json({ ok: true, isFollowing: false });

            const q = `
        select 1
        from public.follows
        where follower_id = $1 and following_id = $2
        limit 1
      `;
            const out = await pool.query(q, [uid, target]);
            return res.json({ ok: true, isFollowing: out.rowCount > 0 });
        } catch (e) {
            console.error("is-following error:", e);
            return res.status(500).json({ ok: false, error: "Server error" });
        }
    });

    // POST /api/follows/toggle  body: { target: "UID" }
    r.post("/toggle", async (req, res) => {
        const client = await pool.connect();
        try {
            const uid = req._uid;
            const target = String(req.body?.target || "").trim();

            if (!uid) return res.status(401).json({ ok: false, error: "Missing X-User-Id" });
            if (!target) return res.status(400).json({ ok: false, error: "Missing target" });
            if (uid === target) return res.status(400).json({ ok: false, error: "Cannot follow self" });

            await client.query("begin");

            // varsa sil, yoksa ekle
            const del = await client.query(
                `delete from public.follows where follower_id=$1 and following_id=$2 returning id`,
                [uid, target]
            );

            let followingNow = false;

            if (del.rowCount === 0) {
                // insert (unique constraint varsa çakışma olursa ignore)
                const ins = await client.query(
                    `insert into public.follows (follower_id, following_id)
           values ($1,$2)
           on conflict (follower_id, following_id) do nothing
           returning id`,
                    [uid, target]
                );
                followingNow = ins.rowCount > 0;
            } else {
                followingNow = false;
            }

            // counts
            const countsQ = `
        select
          (select count(*)::int from public.follows where following_id=$1) as followers,
          (select count(*)::int from public.follows where follower_id=$1) as following
      `;
            const counts = await client.query(countsQ, [target]);

            await client.query("commit");

            return res.json({
                ok: true,
                isFollowing: followingNow,
                targetCounts: counts.rows?.[0] || { followers: 0, following: 0 },
            });
        } catch (e) {
            await client.query("rollback").catch(() => {});
            console.error("toggle follow error:", e);
            return res.status(500).json({ ok: false, error: "Server error" });
        } finally {
            client.release();
        }
    });

    // GET /api/follows/followers?uid=UID&limit=50&offset=0
    r.get("/followers", async (req, res) => {
        try {
            const uid = String(req.query.uid || "").trim();
            if (!uid) return res.status(400).json({ ok: false, error: "Missing uid" });

            const limit = toInt(req.query.limit, 50, 1, 200);
            const offset = toInt(req.query.offset, 0, 0, 1_000_000);

            const q = `
        select follower_id as uid, created_at
        from public.follows
        where following_id = $1
        order by created_at desc
        limit $2 offset $3
      `;
            const out = await pool.query(q, [uid, limit, offset]);

            return res.json({ ok: true, items: out.rows, limit, offset });
        } catch (e) {
            console.error("followers error:", e);
            return res.status(500).json({ ok: false, error: "Server error" });
        }
    });

    // GET /api/follows/following?uid=UID&limit=50&offset=0
    r.get("/following", async (req, res) => {
        try {
            const uid = String(req.query.uid || "").trim();
            if (!uid) return res.status(400).json({ ok: false, error: "Missing uid" });

            const limit = toInt(req.query.limit, 50, 1, 200);
            const offset = toInt(req.query.offset, 0, 0, 1_000_000);

            const q = `
        select following_id as uid, created_at
        from public.follows
        where follower_id = $1
        order by created_at desc
        limit $2 offset $3
      `;
            const out = await pool.query(q, [uid, limit, offset]);

            return res.json({ ok: true, items: out.rows, limit, offset });
        } catch (e) {
            console.error("following error:", e);
            return res.status(500).json({ ok: false, error: "Server error" });
        }
    });

    // GET /api/follows/counts?uid=UID
    r.get("/counts", async (req, res) => {
        try {
            const uid = String(req.query.uid || "").trim();
            if (!uid) return res.status(400).json({ ok: false, error: "Missing uid" });

            const q = `
        select
          (select count(*)::int from public.follows where following_id=$1) as followers,
          (select count(*)::int from public.follows where follower_id=$1) as following
      `;
            const out = await pool.query(q, [uid]);

            return res.json({ ok: true, ...out.rows?.[0] });
        } catch (e) {
            console.error("counts error:", e);
            return res.status(500).json({ ok: false, error: "Server error" });
        }
    });

    return r;
}
