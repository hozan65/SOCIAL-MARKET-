// netlify/functions/upload_avatar.js
const { createClient } = require("@supabase/supabase-js");
const { authUser } = require("./_auth_user");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const BUCKET = (process.env.AVATAR_BUCKET || "avatars").trim();

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

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Missing Supabase env" });

        const jwt = getBearer(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        const me = await authUser(jwt); // { uid, email }

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch {}

        const base64 = String(body.base64 || "").trim();
        const extRaw = String(body.ext || "jpg").toLowerCase();
        const ext = extRaw === "jpeg" ? "jpg" : extRaw;

        if (!base64) return json(400, { error: "Missing base64" });
        if (!["jpg", "png", "webp"].includes(ext)) return json(400, { error: "Invalid ext" });

        const buf = Buffer.from(base64, "base64");
        if (!buf.length) return json(400, { error: "Invalid base64" });

        const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

        const sb = createClient(SUPABASE_URL, SERVICE_KEY);

        const path = `${me.uid}/avatar.${ext}`;

        const { error: upErr } = await sb.storage
            .from(BUCKET)
            .upload(path, buf, { contentType, upsert: true });

        if (upErr) throw upErr;

        const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
        const avatar_url = pub?.publicUrl || "";

        const { error: dbErr } = await sb
            .from("profiles")
            .update({ avatar_url, updated_at: new Date().toISOString() })
            .eq("appwrite_user_id", me.uid);

        if (dbErr) throw dbErr;

        return json(200, { ok: true, avatar_url });
    } catch (e) {
        console.error("upload_avatar error:", e);
        return json(500, { error: e?.message || "Server error" });
    }
};
