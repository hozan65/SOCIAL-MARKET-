// netlify/functions/upsert_profile.js
const { createClient } = require("@supabase/supabase-js");
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

// URL sanitize (boş ise "" döner)
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

        // ✅ BURASI ÖNEMLİ:
        // avatar_url alanını HER ZAMAN set ediyoruz (delete için "" gelsin)
        const payload = {
            appwrite_user_id: user.uid,
            email: s(body.email || user.email),
            name: s(body.name || body.display_name || user.email?.split("@")?.[0] || "user"),

            bio: s(body.bio),
            website: cleanUrl(body.website),

            // 2.link olarak x kullanıyorsan:
            x: cleanUrl(body.x),

            // ✅ avatar_url boş da gelse yaz
            avatar_url: cleanUrl(body.avatar_url), // "" ise DB'ye "" yazar

            updated_at: new Date().toISOString(),
        };

        const sb = createClient(SUPABASE_URL, SERVICE_KEY);

        // appwrite_user_id UNIQUE olmalı
        const { error } = await sb.from("profiles").upsert(payload, {
            onConflict: "appwrite_user_id",
        });

        if (error) throw error;

        return json(200, { ok: true });
    } catch (e) {
        console.error("upsert_profile error:", e);
        return json(500, { error: e?.message || "Server error" });
    }
};
