// netlify/functions/list_following.js (FULL FIX)
import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        let uid = String(event.queryStringParameters?.id || "").trim();

        // ✅ if id missing, fallback to JWT user
        if (!uid) {
            const { user } = await getAppwriteUser(event);
            uid = user?.$id ? String(user.$id) : "";
        }

        if (!uid) return json(400, { error: "Missing id" });

        const { data: rel, error: e1 } = await sb
            .from("follows")
            .select("following_uid, created_at")
            .eq("follower_uid", uid)
            .order("created_at", { ascending: false })
            .limit(200);

        if (e1) return json(500, { error: e1.message });

        const ids = (rel || []).map(r => r.following_uid).filter(Boolean);
        if (!ids.length) return json(200, { list: [] });

        const { data: profs, error: e2 } = await sb
            .from("profiles")
            .select("appwrite_user_id, name, avatar_url")
            .in("appwrite_user_id", ids)
            .limit(200);

        if (e2) return json(500, { error: e2.message });

        const map = new Map((profs || []).map(p => [p.appwrite_user_id, p]));

        const list = ids
            .map(id => map.get(id))
            .filter(Boolean)
            .map(p => ({
                user_id: p.appwrite_user_id,
                username: p.name || "User",
                avatar_url: p.avatar_url || null
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
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT",
            "Access-Control-Allow-Methods": "GET, OPTIONS"
        },
        body: JSON.stringify(body)
    };
}
