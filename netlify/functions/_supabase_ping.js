import { createClient } from "@supabase/supabase-js";

export const handler = async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) return { statusCode: 500, body: "Missing SUPABASE env" };

    const sb = createClient(url, key);

    const { error } = await sb.from("follows").insert([
        { follower_uid: "ping_a", following_uid: "ping_b" }
    ]);

    if (error) return { statusCode: 500, body: error.message };
    return { statusCode: 200, body: "supabase insert ok" };
};
