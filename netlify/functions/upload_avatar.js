// netlify/functions/upload_avatar.js  (CommonJS)
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

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SUPABASE_URL || !SERVICE_KEY) {
            return json(500, { error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
        }

        const jwt = getBearer(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        // ✅ Appwrite auth
        const me = await authUser(jwt); // { uid, email }

        const body = JSON.parse(event.body || "{}");
        const base64 = String(body.base64 || "");
        const extRaw = String(body.ext || "jpg").toLowerCase();
        const ext = extRaw === "jpeg" ? "jpg" : extRaw;

        if (!base64) return json(400, { error: "Missing base64" });
        if (!["jpg", "png", "webp"].includes(ext)) return json(400, { error: "Invalid ext" });

        // ✅ base64 -> buffer
        const buffer = Buffer.from(base64, "base64");
        if (!buffer.length) return json(400, { error: "Invalid base64 data" });

        const contentType =
            ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

        // ✅ bucket yolu (Supabase Storage)
        // NOT: Bu yol "storage/v1/object/<bucket>/<path>" formatında olmalı
        const bucket = "avatars";
        const objectPath = `${me.uid}.${ext}`; // örn: 694d... .jpg

        // ✅ Upload (PUT) + upsert
        const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${SERVICE_KEY}`,
                "Content-Type": contentType,
                "x-upsert": "true",
            },
            body: buffer,
        });

        const upText = await up.text();
        if (!up.ok) return json(up.status, { error: upText || "Upload failed" });

        // ✅ Public URL
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;

        // ✅ profiles.avatar_url update (PATCH)
        const pr = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?appwrite_user_id=eq.${me.uid}`,
            {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${SERVICE_KEY}`,
                    apikey: SERVICE_KEY,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    avatar_url: publicUrl,
                    updated_at: new Date().toISOString(),
                }),
            }
        );

        const prText = await pr.text();
        if (!pr.ok) return json(pr.status, { error: prText || "Profile update failed" });

        return json(200, { ok: true, avatar_url: publicUrl });
    } catch (e) {
        console.error("upload_avatar error:", e);
        return json(500, { error: e?.message || "Server error" });
    }
};
