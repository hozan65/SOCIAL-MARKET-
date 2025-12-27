import { createClient } from "@supabase/supabase-js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async (event) => {
    try {
        const id = event.queryStringParameters?.id;
        if (!id) return json(400, { error: "Missing id" });

        const { data, error } = await sb
            .from("follows")
            .select("target_id, profiles:target_id(id, name, avatar_url)")
            .eq("follower_id", id)
            .order("created_at", { ascending: false })
            .limit(200);

        if (error) return json(500, { error: error.message });

        const list = (data || [])
            .map((x) => x.profiles)
            .filter(Boolean);

        return json(200, { list });
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
