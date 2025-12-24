import { createClient } from "@supabase/supabase-js";
import { verifyAppwriteUser } from "./_verify.js";

export default async (req) => {
    try {
        if (req.method !== "POST") {
            return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
        }

        const { userId } = await verifyAppwriteUser(req);
        const { postId, content } = await req.json();
        const text = String(content || "").trim();

        if (!postId) return new Response(JSON.stringify({ error: "postId missing" }), { status: 400 });
        if (!text) return new Response(JSON.stringify({ error: "Empty comment" }), { status: 400 });

        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { error } = await sb
            .from("post_comments")
            .insert({ post_id: postId, user_id: userId, content: text });
        if (error) throw error;

        const { data, error: lErr } = await sb
            .from("post_comments")
            .select("id,user_id,content,created_at")
            .eq("post_id", postId)
            .order("created_at", { ascending: true })
            .limit(50);
        if (lErr) throw lErr;

        return new Response(JSON.stringify({ ok: true, comments: data || [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e?.message || "unknown" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }
};
