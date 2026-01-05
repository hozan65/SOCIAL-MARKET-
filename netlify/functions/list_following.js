// netlify/functions/list_following.js
// ✅ Supabase REMOVED
// ✅ sm-api provides following list

const SM_API_BASE_URL = (process.env.SM_API_BASE_URL || "").trim();
const SM_API_TIMEOUT_MS = Number(process.env.SM_API_TIMEOUT_MS || "6500") || 6500;

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        if (!SM_API_BASE_URL) return json(500, { error: "Missing SM_API_BASE_URL env" });

        const uid = String(event.queryStringParameters?.id || "").trim();
        if (!uid) return json(400, { error: "Missing id" });

        const out = await smGet(`/api/follow/following?id=${encodeURIComponent(uid)}`);

        const raw = Array.isArray(out?.list)
            ? out.list
            : Array.isArray(out?.data?.list)
                ? out.data.list
                : [];

        const list = raw.map((x) => ({
            id: String(x.id || x.user_id || x.uid || x.appwrite_user_id || "").trim(),
            name: x.name || x.username || "User",
            avatar_url: x.avatar_url || x.avatar || null,
        })).filter((x) => x.id);

        return json(200, { list });
    } catch (e) {
        return json(500, { error: String(e?.message || e) });
    }
};

async function smGet(path) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SM_API_TIMEOUT_MS);

    try {
        const r = await fetch(`${SM_API_BASE_URL}${path}`, { method: "GET", signal: ctrl.signal });

        const txt = await r.text().catch(() => "");
        let j = {};
        try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }

        if (!r.ok) throw new Error(j?.error || j?.message || `sm-api GET ${path} failed (${r.status})`);
        return j;
    } catch (e) {
        if (String(e?.name || "").toLowerCase() === "aborterror") throw new Error("sm-api timeout");
        throw e;
    } finally {
        clearTimeout(t);
    }
}

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "content-type, authorization, X-User-Id",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
