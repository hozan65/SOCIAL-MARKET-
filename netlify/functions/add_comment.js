// netlify/functions/add_comment.js
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
        const content = String(body.content || "").trim();

        if (!post_id) return json(400, { ok: false, error: "post_id missing" });
        if (!content) return json(400, { ok: false, error: "content empty" });

        const ins = await supabase
            .from("post_comments")
            .insert({ post_id, user_id: userId, content })
            .select("id, post_id, user_id, content, created_at")
            .single();

        if (ins.error) return json(500, { ok: false, error: "Supabase insert failed", detail: ins.error });

        // return latest comments
        const list = await supabase
            .from("post_comments")
            .select("id, user_id, content, created_at")
            .eq("post_id", post_id)
            .order("created_at", { ascending: true })
            .limit(50);

        if (list.error) return json(500, { ok: false, error: "Supabase load failed", detail: list.error });

        return json(200, { ok: true, comment: ins.data, comments: list.data || [] });
    } catch (e) {
        return json(401, { ok: false, error: e?.message || "Unauthorized" });
    }
};
