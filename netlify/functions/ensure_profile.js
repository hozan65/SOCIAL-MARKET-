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

        // ✅ JWT'den user al
        const { user } = await getAppwriteUser(event);
        const uid = user.$id;
        const name = user.name || "";

        // Profil var mı?
        const { data: existing, error: e1 } = await sb
            .from("profiles")
            .select("appwrite_user_id")
            .eq("appwrite_user_id", uid)
            .maybeSingle();

        if (e1) return json(500, { error: e1.message });

        // Yoksa oluştur
        if (!existing) {
            const { error: e2 } = await sb.from("profiles").insert({
                appwrite_user_id: uid,
                name,
                bio: null,
                website: null,
                avatar_url: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            if (e2) return json(500, { error: e2.message });
        }

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
