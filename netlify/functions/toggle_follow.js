// netlify/functions/toggle_follow.js
import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY =
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

        if (!SUPABASE_URL || !SUPABASE_KEY) {
            return json(500, { error: "Missing SUPABASE env" });
        }

        const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

        // 🔐 Appwrite auth
        const { user } = await getAppwriteUser(event);
        if (!user?.$id) return json(401, { error: "Unauthorized" });
        const myUid = user.$id;

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch {}

        const following_uid = String(body.following_uid || "").trim();
        if (!following_uid) return json(400, { error: "Missing following_uid" });
        if (following_uid === myUid) return json(400, { error: "Cannot follow yourself" });

        // ✅ FK FIX — profiles.appwrite_user_id
        const p1 = await sb.from("profiles").upsert(
            [{ appwrite_user_id: myUid }],
            { onConflict: "appwrite_user_id" }
        );
        if (p1.error) return json(500, { error: `profiles upsert (me) failed: ${p1.error.message}` });

        const p2 = await sb.from("profiles").upsert(
            [{ appwrite_user_id: following_uid }],
            { onConflict: "appwrite_user_id" }
        );
        if (p2.error) return json(500, { error: `profiles upsert (target) failed: ${p2.error.message}` });

        // 🔎 existing follow?
        const { data: existing, error: e1 } = await sb
            .from("follows")
            .select("id")
            .eq("follower_uid", myUid)
            .eq("following_uid", following_uid)
            .maybeSingle();

        if (e1) return json(500, { error: e1.message });

        let following = false;

        if (existing?.id) {
            const { error } = await sb.from("follows").delete().eq("id", existing.id);
            if (error) return json(500, { error: error.message });
            following = false;
        } else {
            const { error } = await sb.from("follows").insert([
                { follower_uid: myUid, following_uid }
            ]);
            if (error) return json(500, { error: error.message });
            following = true;
        }

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
