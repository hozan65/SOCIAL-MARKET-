// netlify/functions/get_profile.js  (FULL FIXED)
// - if ?id missing -> infer uid from JWT (same auth as other functions)
// - still supports /get_profile?id=OTHER_UID

import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
);

export const handler = async (event) => {
    try {
        // CORS preflight (optional but good)
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

        let uid = String(event.queryStringParameters?.id || "").trim();

        // ✅ FIX: if id not provided, use JWT user
        if (!uid) {
            const { user } = await getAppwriteUser(event).catch(() => ({ user: null }));
            uid = user?.$id ? String(user.$id) : "";
        }

        if (!uid) return json(401, { error: "Missing id" });

        const { data: prof, error: pe } = await sb
            .from("profiles")
            .select("appwrite_user_id, name, bio, website, avatar_url, created_at")
            .eq("appwrite_user_id", uid)
            .maybeSingle();

        if (pe) return json(500, { error: pe.message });
        if (!prof) return json(404, { error: "Profile not found" });

        const links = [];
        if (prof.website) links.push({ url: prof.website, label: "" });

        const [followersRes, followingRes, postsRes] = await Promise.all([
            sb.from("follows").select("id", { count: "exact", head: true }).eq("following_uid", uid),
            sb.from("follows").select("id", { count: "exact", head: true }).eq("follower_uid", uid),
            sb.from("analyses").select("id", { count: "exact", head: true }).eq("author_id", uid),
        ]);

        if (followersRes.error) return json(500, { error: followersRes.error.message });
        if (followingRes.error) return json(500, { error: followingRes.error.message });
        if (postsRes.error) return json(500, { error: postsRes.error.message });

        const { data: postList, error: ae } = await sb
            .from("analyses")
            .select("id, image_url:image_path, caption:content, created_at")
            .eq("author_id", uid)
            .order("created_at", { ascending: false })
            .limit(30);

        if (ae) return json(500, { error: ae.message });

        return json(200, {
            profile: {
                id: prof.appwrite_user_id,
                name: prof.name,
                bio: prof.bio,
                avatar_url: prof.avatar_url,
                links,
                created_at: prof.created_at,
            },
            counts: {
                followers: followersRes.count ?? 0,
                following: followingRes.count ?? 0,
                posts: postsRes.count ?? 0,
            },
            posts: postList || [],
            is_following: false,
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
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "content-type, authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
