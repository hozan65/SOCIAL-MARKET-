// netlify/functions/toggle_like.js
const { appwriteMe, getBearerToken } = require("./_auth_user");

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify(body),
    };
}

async function sbFetch(path, { method = "GET", body = null } = {}) {
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base) throw new Error("MISSING_SUPABASE_URL");
    if (!key) throw new Error("MISSING_SERVICE_ROLE_KEY");

    const res = await fetch(`${base}${path}`, {
        method,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        },
        body: body ? JSON.stringify(body) : null,
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
}

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

    try {
        const token = getBearerToken(event);
        const user_id = await appwriteMe(token); // ✅ Appwrite JWT doğrulama

        let payload = {};
        try { payload = JSON.parse(event.body || "{}"); } catch {}
        const post_id = payload.post_id;
        if (!post_id) return json(400, { ok: false, error: "Missing post_id" });

        const q =
            `/rest/v1/post_likes?select=post_id,user_id` +
            `&post_id=eq.${encodeURIComponent(post_id)}` +
            `&user_id=eq.${encodeURIComponent(user_id)}` +
            `&limit=1`;

        const exists = await sbFetch(q);
        if (!exists.ok) return json(500, { ok: false, error: "Select failed", detail: exists });

        const hasLike = Array.isArray(exists.data) && exists.data.length > 0;

        if (hasLike) {
            const del = await sbFetch(
                `/rest/v1/post_likes?post_id=eq.${encodeURIComponent(post_id)}&user_id=eq.${encodeURIComponent(user_id)}`,
                { method: "DELETE" }
            );
            if (!del.ok) return json(500, { ok: false, error: "Delete failed", detail: del });
            return json(200, { ok: true, liked: false });
        } else {
            const ins = await sbFetch(`/rest/v1/post_likes`, {
                method: "POST",
                body: [{ post_id, user_id }],
            });
            if (!ins.ok) return json(500, { ok: false, error: "Insert failed", detail: ins });
            return json(200, { ok: true, liked: true });
        }
    } catch (e) {
        const msg = e?.message || "unknown";
        const code = (msg === "MISSING_TOKEN" || msg === "UNAUTHORIZED") ? 401 : 500;
        return json(code, { ok: false, error: msg });
    }
};
