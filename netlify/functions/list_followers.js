import { createClient } from "@supabase/supabase-js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async (event) => {
    const uid = event.queryStringParameters?.id;
    if (!uid) return json(400, { error: "Missing id" });

    const { data, error } = await sb
        .from("follows")
        .select("follower_id, profiles:follower_id(appwrite_user_id,name,avatar_url)")
        .eq("target_id", uid);

    if (error) return json(500, { error: error.message });

    return json(200, {
        list: (data || []).map(x => ({
            id: x.profiles.appwrite_user_id,
            name: x.profiles.name,
            avatar_url: x.profiles.avatar_url
        }))
    });
};

const json = (s,b)=>({
    statusCode:s,
    headers:{ "Content-Type":"application/json","Access-Control-Allow-Origin":"*" },
    body:JSON.stringify(b)
});
