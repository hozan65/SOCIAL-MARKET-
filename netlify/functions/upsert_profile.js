import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async (event) => {
    try {
        if (event.httpMethod !== "POST") {
            return json(405, { error: "Method not allowed" });
        }

        const { user } = await getAppwriteUser(event);
        const uid = user.$id;

        const body = JSON.parse(event.body || "{}");

        const payload = {
            appwrite_user_id: uid,
            name: user.name || "",
            bio: body.bio || null,
            website: body.website || null,
            updated_at: new Date().toISOString()
        };

        const { error } = await sb
            .from("profiles")
            .upsert(payload, { onConflict: "appwrite_user_id" });

        if (error) return json(500, { error: error.message });

        return json(200, { ok: true });
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
