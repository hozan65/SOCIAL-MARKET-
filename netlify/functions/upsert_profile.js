// netlify/functions/upsert_profile.js
const { authUser } = require("./_auth_user");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

function json(statusCode, bodyObj) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(bodyObj),
    };
}

function getBearer(event) {
    const h = event.headers.authorization || event.headers.Authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

const s = (v) => String(v ?? "").trim();
const cleanUrl = (v) => {
    const x = s(v);
    if (!x) return "";
    try {
        const u = new URL(x.startsWith("http") ? x : "https://" + x);
        return u.toString();
    } catch {
        return "";
    }
};

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Missing Supabase env" });

        const jwt = getBearer(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        const user = await authUser(jwt); // { uid, email }
        const body = JSON.parse(event.body || "{}");

        const payload = {
            name: s(body.name) || (user.email ? user.email.split("@")[0] : "User"),
            bio: s(body.bio),
            website: cleanUrl(body.website),
            updated_at: new Date().toISOString(),
        };

        // 1) PATCH update
        const patch = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?appwrite_user_id=eq.${user.uid}`,
            {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${SERVICE_KEY}`,
                    apikey: SERVICE_KEY,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            }
        );

        if (patch.ok) return json(200, { ok: true, mode: "updated" });

        // 2) POST insert (first time)
        const insert = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${SERVICE_KEY}`,
                apikey: SERVICE_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                appwrite_user_id: user.uid,
                email: user.email,
                ...payload,
            }),
        });

        const t = await insert.text();
        if (!insert.ok) return json(insert.status, { error: t || "Insert failed" });

        return json(200, { ok: true, mode: "inserted" });
    } catch (e) {
        console.error("upsert_profile error:", e);
        return json(500, { error: e?.message || "Server error" });
    }
};
