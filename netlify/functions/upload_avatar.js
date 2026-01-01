// netlify/functions/avatar_upload.js  (örnek isim)
// ESM

import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const BUCKET = "avatars";

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}

function getServiceKey() {
    return (
        (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim() ||
        (process.env.SUPABASE_SERVICE_ROLE || "").trim()
    );
}

function decodeBase64(input) {
    // accepts raw base64 OR dataURL like "data:image/png;base64,AAA..."
    const s = String(input || "");
    const base64 = s.includes("base64,") ? s.split("base64,").pop() : s;
    return Buffer.from(base64, "base64");
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
        const SERVICE_KEY = getServiceKey();
        if (!SUPABASE_URL || !SERVICE_KEY) {
            return json(500, { error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
        }

        const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        const { user } = await getAppwriteUser(event);
        const uid = user.$id;

        const body = JSON.parse(event.body || "{}");
        if (!body.file_base64) return json(400, { error: "Missing file_base64" });

        const contentType = String(body.content_type || "image/png");
        const buffer = decodeBase64(body.file_base64);

        // ✅ bucket "avatars" içinde path: "UID_timestamp.png"
        const path = `${uid}_${Date.now()}.png`;

        const { error: uploadErr } = await sb.storage
            .from(BUCKET)
            .upload(path, buffer, {
                contentType,
                upsert: true,
            });

        if (uploadErr) return json(500, { error: uploadErr.message });

        const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
        const avatar_url = data?.publicUrl || "";

        const { error: upsertErr } = await sb
            .from("profiles")
            .upsert(
                { appwrite_user_id: uid, avatar_url, updated_at: new Date().toISOString() },
                { onConflict: "appwrite_user_id" }
            );

        if (upsertErr) return json(500, { error: upsertErr.message });

        return json(200, { ok: true, avatar_url });
    } catch (e) {
        const msg = String(e?.message || e);
        return json(msg.toLowerCase().includes("jwt") ? 401 : 500, { error: msg });
    }
};
