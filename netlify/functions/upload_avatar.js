import { authedUser } from "./_auth_user.js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const json = (statusCode, bodyObj) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(bodyObj),
});

export async function handler(event) {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
        if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Missing Supabase env" });

        const me = await authedUser(event);
        if (!me?.ok) return json(401, { error: me?.error || "Unauthorized" });

        const body = JSON.parse(event.body || "{}");
        const base64 = String(body.base64 || "");
        const ext = String(body.ext || "jpg").toLowerCase();

        if (!base64) return json(400, { error: "Missing base64" });
        if (!["jpg", "jpeg", "png", "webp"].includes(ext)) return json(400, { error: "Invalid ext" });

        const buffer = Buffer.from(base64, "base64");
        if (!buffer?.length) return json(400, { error: "Invalid base64 data" });

        // bucket: avatars (public)
        const path = `avatars/${me.user_id}.${ext}`;
        const contentType =
            ext === "png" ? "image/png" :
                ext === "webp" ? "image/webp" : "image/jpeg";

        // Storage upload (upsert)
        const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${path}`, {
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

        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${path}`;

        // profiles.avatar_url update
        const pr = await fetch(`${SUPABASE_URL}/rest/v1/profiles?appwrite_user_id=eq.${me.user_id}`, {
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
        });

        const prText = await pr.text();
        if (!pr.ok) return json(pr.status, { error: prText || "Profile update failed" });

        return json(200, { ok: true, avatar_url: publicUrl });
    } catch (e) {
        console.error("upload_avatar error:", e);
        return json(500, { error: e?.message || "Server error" });
    }
}
