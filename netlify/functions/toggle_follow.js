// netlify/functions/toggle_follow.js
import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        // ENV check (çok önemli)
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            console.error("Missing env:", { hasUrl: !!SUPABASE_URL, hasKey: !!SUPABASE_KEY });
            return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
        }
        const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

        // Auth check (çok önemli)
        const { user } = await getAppwriteUser(event);
        if (!user?.$id) {
            console.error("Unauthorized: no user from getAppwriteUser");
            return json(401, { error: "Unauthorized" });
        }
        const myUid = user.$id;

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch {}

        const following_uid = String(body.following_uid || body.following_id || "").trim();
        if (!following_uid) return json(400, { error: "Missing following_uid" });
        if (following_uid === myUid) return json(400, { error: "Cannot follow yourself" });

        const { data: existing, error: e1 } = await sb
            .from("follows")
            .select("id")
            .eq("follower_uid", myUid)
            .eq("following_uid", following_uid)
            .maybeSingle();

        if (e1) return json(500, { error: e1.message });

        let following = false;

        if (existing?.id) {
            const { error: delErr } = await sb.from("follows").delete().eq("id", existing.id);
            if (delErr) return json(500, { error: delErr.message });
            following = false;
        } else {
            const { error: insErr } = await sb.from("follows").insert([{ follower_uid: myUid, following_uid }]);
            if (insErr) return json(500, { error: insErr.message });
            following = true;
        }

        // counts (error check ekledim)
        const [a, b] = await Promise.all([
            sb.from("follows").select("*", { count: "exact", head: true }).eq("following_uid", following_uid),
            sb.from("follows").select("*", { count: "exact", head: true }).eq("follower_uid", myUid),
        ]);
        if (a.error) return json(500, { error: a.error.message });
        if (b.error) return json(500, { error: b.error.message });

        return json(200, {
            ok: true,
            following,
            followers_count: Number(a.count || 0),
            following_count: Number(b.count || 0),
        });
    } catch (e) {
        console.error("toggle_follow crash:", e);
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
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
