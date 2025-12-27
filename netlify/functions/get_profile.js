import { createClient } from "@supabase/supabase-js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async (event) => {
    try {
        const id = event.queryStringParameters?.id;
        if (!id) return json(400, { error: "Missing id" });

        // 1) profile
        const { data: prof, error: pe } = await sb
            .from("profiles")
            .select("id, name, bio, avatar_url, link1, link2, created_at")
            .eq("id", id)
            .maybeSingle();

        if (pe) return json(500, { error: pe.message });
        if (!prof) return json(404, { error: "Profile not found" });

        const links = [];
        if (prof.link1) links.push({ url: prof.link1, label: "" });
        if (prof.link2) links.push({ url: prof.link2, label: "" });

        // 2) counts
        const [{ count: followers }, { count: following }, { count: posts }] = await Promise.all([
            sb.from("follows").select("id", { count: "exact", head: true }).eq("target_id", id),
            sb.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", id),
            sb.from("analyses").select("id", { count: "exact", head: true }).eq("author_id", id),
        ]);

        // 3) posts (analyses)
        const { data: postList, error: ae } = await sb
            .from("analyses")
            .select("id, image_url:image_path, caption:content, created_at")
            .eq("author_id", id)
            .order("created_at", { ascending: false })
            .limit(30);

        if (ae) return json(500, { error: ae.message });

        // 4) is_following (optional, if jwt provided and you want)
        // Şimdilik public: false döndür (follow butonu yine çalışır, toggle_follow zaten jwt ister)
        const is_following = false;

        return json(200, {
            profile: {
                id: prof.id,
                name: prof.name,
                bio: prof.bio,
                avatar_url: prof.avatar_url,
                links,
                created_at: prof.created_at
            },
            counts: {
                followers: followers ?? 0,
                following: following ?? 0,
                posts: posts ?? 0
            },
            posts: postList || [],
            is_following
        });
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
        body: JSON.stringify(body),
    };
}
