import { createClient } from "@supabase/supabase-js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async (event) => {
    try {
        const uid = event.queryStringParameters?.id;
        if (!uid) return json(400, { error: "Missing id" });

        // ✅ profiles key = appwrite_user_id
        const { data: prof, error: pe } = await sb
            .from("profiles")
            .select("appwrite_user_id, name, bio, website, avatar_url, created_at")
            .eq("appwrite_user_id", uid)
            .maybeSingle();

        if (pe) return json(500, { error: pe.message });
        if (!prof) return json(404, { error: "Profile not found" });

        // website tek alan -> link listesine çevir
        const links = [];
        if (prof.website) links.push({ url: prof.website, label: "" });

        // ✅ counts (SENİN TABLOYA GÖRE)
        // followers: beni takip eden kişi sayısı -> following_uid = benim uid
        // following: benim takip ettiklerim -> follower_uid = benim uid
        const [
            { count: followers, error: fe },
            { count: following, error: foe },
            { count: posts, error: poe }
        ] = await Promise.all([
            sb.from("follows").select("id", { count: "exact", head: true }).eq("following_uid", uid),
            sb.from("follows").select("id", { count: "exact", head: true }).eq("follower_uid", uid),
            sb.from("analyses").select("id", { count: "exact", head: true }).eq("author_id", uid),
        ]);

        if (fe) return json(500, { error: fe.message });
        if (foe) return json(500, { error: foe.message });
        if (poe) return json(500, { error: poe.message });

        // posts (analyses)
        const { data: postList, error: ae } = await sb
            .from("analyses")
            .select("id, image_url:image_path, caption:content, created_at")
            .eq("author_id", uid)
            .order("created_at", { ascending: false })
            .limit(30);

        if (ae) return json(500, { error: ae.message });

        return json(200, {
            profile: {
                id: prof.appwrite_user_id, // ✅ client p.id bekliyor
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
            is_following: false
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
