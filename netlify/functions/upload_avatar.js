import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = "avatars";

export const handler = async (event) => {
    try {
        if (event.httpMethod !== "POST") {
            return json(405, { error: "Method not allowed" });
        }

        const { user } = await getAppwriteUser(event);
        const uid = user.$id;

        const body = JSON.parse(event.body || "{}");
        if (!body.file_base64) {
            return json(400, { error: "Missing file_base64" });
        }

        const buffer = Buffer.from(body.file_base64, "base64");
        const path = `avatars/${uid}_${Date.now()}.png`;

        const { error: uploadErr } = await sb.storage
            .from(BUCKET)
            .upload(path, buffer, {
                contentType: body.content_type || "image/png",
                upsert: true
            });

        if (uploadErr) return json(500, { error: uploadErr.message });

        const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
        const avatar_url = data.publicUrl;

        await sb
            .from("profiles")
            .upsert(
                { appwrite_user_id: uid, avatar_url, updated_at: new Date().toISOString() },
                { onConflict: "appwrite_user_id" }
            );

        return json(200, { avatar_url });
    } catch (e) {
        const msg = String(e?.message || e);
        return json(msg.includes("JWT") ? 401 : 500, { error: msg });
    }
};

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT"
        },
        body: JSON.stringify(body)
    };
}
