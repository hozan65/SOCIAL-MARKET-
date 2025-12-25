// netlify/functions/toggle_follow.js
import { createClient } from "@supabase/supabase-js";
import { getBearer } from "./_verify.js";
import { authUser } from "./_auth_user.js";

const json = (statusCode, bodyObj) =>
    new Response(JSON.stringify(bodyObj), {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
    });

export default async (req) => {
    try {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!SUPABASE_URL || !SERVICE_KEY) {
            return json(500, { error: "Missing Supabase env" });
        }

        // JWT doğrula (Appwrite)
        const jwt = getBearer(req);
        if (!jwt) return json(401, { error: "Missing JWT" });

        const user = await authUser(jwt); // { uid, email }
        if (!user?.uid) return json(401, { error: "Invalid JWT" });

        // body: { following_uid: "xxxxx" }
        const body = JSON.parse(req.body || "{}");
        const following_uid = String(body.following_uid || "").trim();

        if (!following_uid) return json(400, { error: "Missing following_uid" });
        if (following_uid === user.uid) return json(400, { error: "Cannot follow yourself" });

        const sb = createClient(SUPABASE_URL, SERVICE_KEY);

        // ✅ UID kolonlarını kullan
        const { data: existing, error: e1 } = await sb
            .from("follows")
            .select("id")
            .eq("follower_uid", user.uid)
            .eq("following_uid", following_uid)
            .maybeSingle();

        if (e1) throw e1;

        // varsa unfollow
        if (existing?.id) {
            const { error: delErr } = await sb
                .from("follows")
                .delete()
                .eq("id", existing.id);

            if (delErr) throw delErr;
            return json(200, { ok: true, following: false });
        }

        // yoksa follow
        const { error: insErr } = await sb
            .from("follows")
            .insert([{ follower_uid: user.uid, following_uid }]);

        if (insErr) throw insErr;

        return json(200, { ok: true, following: true });
    } catch (e) {
        console.error("toggle_follow error:", e);
        return json(500, { error: e?.message || "Server error" });
    }
};
