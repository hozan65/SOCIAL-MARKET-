// netlify/functions/upsert_profile.js  (CommonJS)
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

        if (!SUPABASE_URL || !SERVICE_KEY) {
            return json(500, { error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
        }

        const jwt = getBearer(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        // ✅ Appwrite JWT doğrula
        const user = await authUser(jwt); // { uid, email }

        const body = JSON.parse(event.body || "{}");

        // ✅ Payload (senin tablo kolonlarına göre)
        const payload = {
            appwrite_user_id: user.uid,
            name: s(body.name || body.display_name || body.username || ""), // istersen boş bırak
            bio: s(body.bio),
            website: cleanUrl(body.website),
            updated_at: new Date().toISOString(),
        };

        // name boş gelirse email'in user kısmını koy
        if (!payload.name) {
            const em = s(user.email);
            payload.name = em ? em.split("@")[0] : "User";
        }

        // ✅ Upsert (REST) - merge duplicates
        const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${SERVICE_KEY}`,
                apikey: SERVICE_KEY,
                "Content-Type": "application/json",
                Prefer: "resolution=merge-duplicates",
            },
            body: JSON.stringify(payload),
        });

        const t = await r.text();

        if (!r.ok) {
            return json(r.status, { error: t || "Supabase upsert failed" });
        }

        return json(200, { ok: true });
    } catch (e) {
        console.error("upsert_profile error:", e);
        return json(500, { error: e?.message || "Server error" });
    }
};
