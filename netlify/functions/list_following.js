import { createClient } from "@supabase/supabase-js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async (event) => {
    try {
        const uid = event.queryStringParameters?.id;
        if (!uid) return json(400, { error: "Missing id" });

        // follower_uid = uid  => ben kimi takip ediyorum?
        const { data, error } = await sb
            .from("follows")
            .select(
                "following_uid, p:profiles!follows_following_uid_fk(appwrite_user_id,name,avatar_url)"
            )
            .eq("follower_uid", uid)
            .order("created_at", { ascending: false })
            .limit(200);

        if (error) return json(500, { error: error.message });

        const list = (data || [])
            .map((x) => x.p)
            .filter(Boolean)
            .map((p) => ({
                id: p.appwrite_user_id,
                name: p.name,
                avatar_url: p.avatar_url
            }));

        return json(200, { list });
    } catch (e) {
        return json(500, { error: String(e?.message || e) });
    }
};

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify(body)
    };
}
