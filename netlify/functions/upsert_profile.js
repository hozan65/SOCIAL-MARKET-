import { createClient } from "@supabase/supabase-js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async (event) => {
    try {
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const body = JSON.parse(event.body || "{}");
        const { appwrite_user_id, name, bio, website, avatar_url } = body;

        if (!appwrite_user_id) return json(400, { error: "Missing appwrite_user_id" });

        const payload = {
            appwrite_user_id,
            name: name ?? null,
            bio: bio ?? null,
            website: website ?? null,
            avatar_url: avatar_url ?? null,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await sb
            .from("profiles")
            .upsert(payload, { onConflict: "appwrite_user_id" })
            .select("appwrite_user_id, name, bio, website, avatar_url, created_at")
            .single();

        if (error) return json(500, { error: error.message });

        return json(200, { ok: true, profile: data });
    } catch (e) {
        return json(500, { error: String(e?.message || e) });
    }
};

function json(statusCode, body) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(body),
    };
}
