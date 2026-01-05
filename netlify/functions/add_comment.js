// netlify/functions/add_comment.js  (CJS)
// ✅ Supabase REMOVED
// ✅ Netlify -> sm-api
// ✅ Keeps same response shape: { ok:true, comment: {...} }

const { authUser } = require("./_auth_user");

// socket emit
const SOCKET_COMMENT_EMIT_URL = process.env.SOCKET_COMMENT_EMIT_URL || "";
const SOCKET_SECRET = process.env.SOCKET_SECRET || "";

// sm-api
const SM_API_BASE_URL = (process.env.SM_API_BASE_URL || "").trim();

function json(statusCode, bodyObj) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT, x-jwt",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(bodyObj),
    };
}

function extractJWT(event) {
    const h = event?.headers || {};
    const mvh = event?.multiValueHeaders || {};

    const getHeader = (name) => {
        const lower = String(name).toLowerCase();

        for (const k of Object.keys(mvh || {})) {
            if (String(k).toLowerCase() === lower) {
                const v = mvh[k];
                if (Array.isArray(v) && v[0]) return String(v[0]);
                if (typeof v === "string") return v;
            }
        }
        for (const k of Object.keys(h || {})) {
            if (String(k).toLowerCase() === lower) return String(h[k] ?? "");
        }
        return "";
    };

    const auth = (getHeader("authorization") || "").trim();
    if (auth) {
        const m = auth.match(/^Bearer\s+(.+)$/i);
        if (m?.[1]) return m[1].trim();
        return auth.trim();
    }

    const xjwt =
        (getHeader("x-appwrite-jwt") || "").trim() ||
        (getHeader("x-jwt") || "").trim() ||
        (getHeader("sm-jwt") || "").trim();

    return xjwt || "";
}

async function smApiPost(path, { uid, body }, { timeoutMs = 6500 } = {}) {
    if (!SM_API_BASE_URL) throw new Error("Missing SM_API_BASE_URL env");

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
        const r = await fetch(`${SM_API_BASE_URL}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-User-Id": String(uid || "").trim(),
            },
            body: JSON.stringify(body || {}),
            signal: ctrl.signal,
        });

        const txt = await r.text().catch(() => "");
        let data = {};
        try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }

        if (!r.ok) {
            throw new Error(data?.error || data?.message || `sm-api ${path} failed (${r.status})`);
        }
        return data;
    } catch (e) {
        if (String(e?.name || "").toLowerCase() === "aborterror") {
            throw new Error("sm-api timeout");
        }
        throw e;
    } finally {
        clearTimeout(t);
    }
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const jwt = extractJWT(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        // ✅ Appwrite JWT -> uid doğrula
        const { uid } = await authUser(jwt);

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

        const post_id = String(body.post_id || "").trim();
        const content = String(body.content || "").trim();

        if (!post_id) return json(400, { error: "Missing post_id" });
        if (!content) return json(400, { error: "Empty comment" });

        // ✅ sm-api insert
        // NOTE: endpoint adını sm-api’ye göre seçtik: /api/comments/add
        const out = await smApiPost("/api/comments/add", {
            uid,
            body: { post_id, content },
        });

        // normalize comment
        const c = out?.comment || out?.data || out || null;

        if (!c?.id) {
            // sm-api beklenen format dönmediyse
            return json(500, { error: "sm-api returned invalid comment payload" });
        }

        // fire-and-forget socket
        emitCommentSafe({
            post_id: c.post_id || post_id,
            comment_id: c.id,
            user_id: c.user_id || uid,
            content: c.content || content,
            created_at: c.created_at || new Date().toISOString(),
        });

        return json(200, { ok: true, comment: c });
    } catch (e) {
        console.error("add_comment error:", e);
        return json(500, { error: e.message || "Server error" });
    }
};

async function emitCommentSafe(payload) {
    try {
        if (!SOCKET_COMMENT_EMIT_URL) return;

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 1500);

        await fetch(SOCKET_COMMENT_EMIT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-socket-secret": SOCKET_SECRET,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(t);
    } catch {}
}
