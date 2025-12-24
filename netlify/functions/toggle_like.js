// netlify/functions/toggle_like.js
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
        const post_id = body.post_id || body.postId;
        if (!post_id) return json(400, { ok: false, error: "post_id missing" });

        // exists?
        const sel = await supabase
            .from("post_likes")
            .select("post_id", { head: true })
            .eq("post_id", post_id)
            .eq("user_id", userId)
            .maybeSingle();

        if (sel.error && sel.status !== 406) {
            return json(500, { ok: false, error: "Supabase select failed", detail: sel.error });
        }

        let liked;
        if (sel.data) {
            const del = await supabase
                .from("post_likes")
                .delete()
                .eq("post_id", post_id)
                .eq("user_id", userId);

            if (del.error) return json(500, { ok: false, error: "Supabase delete failed", detail: del.error });
            liked = false;
        } else {
            const ins = await supabase
                .from("post_likes")
                .insert({ post_id, user_id: userId });

            if (ins.error) return json(500, { ok: false, error: "Supabase insert failed", detail: ins.error });
            liked = true;
        }

        // count
        const cnt = await supabase
            .from("post_likes")
            .select("*", { count: "exact", head: true })
            .eq("post_id", post_id);

        if (cnt.error) return json(500, { ok: false, error: "Supabase count failed", detail: cnt.error });

        return json(200, { ok: true, liked, count: cnt.count || 0 });
    } catch (e) {
        return json(401, { ok: false, error: e?.message || "Unauthorized" });
    }
};
