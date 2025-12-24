// netlify/functions/toggle_follow.js
const { createClient } = require("@supabase/supabase-js");
const authUser = require("./_auth_user");

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify(body),
    };
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

    try {
        const { userId } = await authUser(event);

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch {}
        const following_id = body.following_id || body.targetUserId || body.userId || body.followingId;
        if (!following_id) return json(400, { ok: false, error: "following_id missing" });
        if (following_id === userId) return json(400, { ok: false, error: "You can't follow yourself" });

        const sel = await supabase
            .from("follows")
            .select("follower_id", { head: true })
            .eq("follower_id", userId)
            .eq("following_id", following_id)
            .maybeSingle();

        if (sel.error && sel.status !== 406) {
            return json(500, { ok: false, error: "Supabase select failed", detail: sel.error });
        }

        let following;
        if (sel.data) {
            const del = await supabase
                .from("follows")
                .delete()
                .eq("follower_id", userId)
                .eq("following_id", following_id);

            if (del.error) return json(500, { ok: false, error: "Supabase delete failed", detail: del.error });
            following = false;
        } else {
            const ins = await supabase
                .from("follows")
                .insert({ follower_id: userId, following_id });

            if (ins.error) return json(500, { ok: false, error: "Supabase insert failed", detail: ins.error });
            following = true;
        }

        return json(200, { ok: true, following });
    } catch (e) {
        return json(401, { ok: false, error: e?.message || "Unauthorized" });
    }
};
