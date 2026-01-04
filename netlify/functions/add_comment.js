// netlify/functions/add_comment.js
const { createClient } = require("@supabase/supabase-js");
const { authUser } = require("./_auth_user");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

// socket emit
const SOCKET_COMMENT_EMIT_URL = process.env.SOCKET_COMMENT_EMIT_URL || "";
const SOCKET_SECRET = process.env.SOCKET_SECRET || "";

function json(statusCode, bodyObj) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(bodyObj),
    };
}

function getBearer(event) {
    const h = event.headers.authorization || event.headers.Authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Missing Supabase env" });

        const jwt = getBearer(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        const { uid } = await authUser(jwt);

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

        const post_id = String(body.post_id || "").trim();
        const content = String(body.content || "").trim();

        if (!post_id) return json(400, { error: "Missing post_id" });
        if (!content) return json(400, { error: "Empty comment" });

        const sb = createClient(SUPABASE_URL, SERVICE_KEY);

        const { data, error } = await sb
            .from("post_comments")
            .insert([{ post_id, user_id: uid, content }])
            .select("id, post_id, user_id, content, created_at")
            .single();

        if (error) throw error;

        // fire-and-forget socket
        emitCommentSafe({
            post_id: data.post_id,
            comment_id: data.id,
            user_id: data.user_id,
            content: data.content,
            created_at: data.created_at,
        });

        return json(200, { ok: true, comment: data });
    } catch (e) {
        console.error("add_comment error:", e);
        return json(500, { error: e.message || "Server error" });
    }
};

async function emitCommentSafe(payload) {
    try {
        if (!SOCKET_COMMENT_EMIT_URL) return;

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 1500);

        await fetch(SOCKET_COMMENT_EMIT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-socket-secret": SOCKET_SECRET,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(t);
    } catch {}
}
