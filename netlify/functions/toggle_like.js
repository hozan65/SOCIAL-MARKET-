import { createClient } from "@supabase/supabase-js";
import { verifyAppwriteUser } from "./_verify.js";

export default async (req) => {
    try {
        if (req.method !== "POST") {
            return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
        }

        const { userId } = await verifyAppwriteUser(req);
        const { postId } = await req.json();
        if (!postId) return new Response(JSON.stringify({ error: "postId missing" }), { status: 400 });

        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { data: existing, error: selErr } = await sb
            .from("post_likes")
            .select("post_id")
            .eq("post_id", postId)
            .eq("user_id", userId)
            .maybeSingle();
        if (selErr) throw selErr;

        let liked;
        if (existing) {
            const { error } = await sb.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
            if (error) throw error;
            liked = false;
        } else {
            const { error } = await sb.from("post_likes").insert({ post_id: postId, user_id: userId });
            if (error) throw error;
            liked = true;
        }

        const { count, error: cErr } = await sb
            .from("post_likes")
            .select("*", { count: "exact", head: true })
            .eq("post_id", postId);
        if (cErr) throw cErr;

        return new Response(JSON.stringify({ liked, count: count || 0 }), {
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
