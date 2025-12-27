// netlify/functions/upsert_profile.js
const { authUser } = require("./_auth_user");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
});

const getBearer = (event) => {
    const h = event.headers.authorization || event.headers.Authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7) : null;
};

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, {});
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SUPABASE_URL || !SERVICE_KEY)
            return json(500, { error: "Missing Supabase env" });

        const jwt = getBearer(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        const user = await authUser(jwt); // { uid, email }

        const body = JSON.parse(event.body || "{}");

        const payload = {
            name: body.name || user.email?.split("@")[0] || "User",
            bio: body.bio || "",
            website: body.website || "",
            updated_at: new Date().toISOString(),
        };

        /* =============================
           1️⃣ PATCH (UPDATE)
        ============================= */
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

        if (patch.ok) {
            return json(200, { ok: true, mode: "updated" });
        }

        /* =============================
           2️⃣ POST (INSERT)
        ============================= */
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

        if (!insert.ok) {
            const t = await insert.text();
            return json(insert.status, { error: t });
        }

        return json(200, { ok: true, mode: "inserted" });

    } catch (e) {
        console.error("upsert_profile error:", e);
        return json(500, { error: e.message });
    }
};
