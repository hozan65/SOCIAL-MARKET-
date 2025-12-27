import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = "avatars";

export const handler = async (event) => {
    try {
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const { user } = await getAppwriteUser(event);
        const uid = user.$id;

        const body = JSON.parse(event.body || "{}");
        const file_base64 = body.file_base64;
        const content_type = body.content_type || "image/png";
        if (!file_base64) return json(400, { error: "Missing file_base64" });

        const bin = Buffer.from(file_base64, "base64");
        const path = `avatars/${uid}_${Date.now()}.png`;

        const { error: upErr } = await sb.storage
            .from(BUCKET)
            .upload(path, bin, { contentType: content_type, upsert: true });

        if (upErr) return json(500, { error: upErr.message });

        const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
        const avatar_url = pub?.publicUrl;

        const { error: dbErr } = await sb
            .from("profiles")
            .upsert(
                { appwrite_user_id: uid, avatar_url, updated_at: new Date().toISOString() },
                { onConflict: "appwrite_user_id" }
            );

        if (dbErr) return json(500, { error: dbErr.message });

        return json(200, { ok: true, avatar_url });
    } catch (e) {
        const msg = String(e?.message || e);
        const code = msg.includes("JWT") ? 401 : 500;
        return json(code, { error: msg });
    }
};

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT, x-jwt",
        },
        body: JSON.stringify(body),
    };
}
