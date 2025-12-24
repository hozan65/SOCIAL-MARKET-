// netlify/functions/toggle_follow.js
import { createClient } from "@supabase/supabase-js";
import { verifyAppwriteUser } from "./_verify.js";

export default async (req) => {
    try {
        if (req.method !== "POST") {
            return new Response(
                JSON.stringify({ error: "Method not allowed" }),
                { status: 405 }
            );
        }

        const { userId } = await verifyAppwriteUser(req);
        const { targetUserId } = await req.json();

        if (!targetUserId) {
            return new Response(
                JSON.stringify({ error: "targetUserId missing" }),
                { status: 400 }
            );
        }

        if (targetUserId === userId) {
            return new Response(
                JSON.stringify({ error: "You cannot follow yourself" }),
                { status: 400 }
            );
        }

        const sb = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Check existing follow
        const { data: existing, error: selErr } = await sb
            .from("follows")
            .select("follower_id")
            .eq("follower_id", userId)
            .eq("following_id", targetUserId)
            .maybeSingle();

        if (selErr) throw selErr;

        let following;

        if (existing) {
            // UNFOLLOW
            const { error } = await sb
                .from("follows")
                .delete()
                .eq("follower_id", userId)
                .eq("following_id", targetUserId);

            if (error) throw error;
            following = false;
        } else {
            // FOLLOW
            const { error } = await sb
                .from("follows")
                .insert({
                    follower_id: userId,
                    following_id: targetUserId,
                });

            if (error) throw error;
            following = true;
        }

        return new Response(
            JSON.stringify({ ok: true, following }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }
        );
    } catch (e) {
        return new Response(
            JSON.stringify({ error: e?.message || "unknown" }),
            {
                status: 401,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
};
