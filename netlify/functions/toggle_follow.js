import { createClient } from "@supabase/supabase-js";
import { verifyAppwriteUser } from "./_verify.js";

const j = (statusCode, obj) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
});

export async function handler(event) {
    try {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SERVICE_KEY) return j(500, { error: "Missing Supabase env" });

        const user = await verifyAppwriteUser(event); // {uid,email,name}
        if (!user?.uid) return j(401, { error: "Unauthorized" });

        const body = JSON.parse(event.body || "{}");
        const following_uid = String(body.following_uid || "").trim();
        if (!following_uid) return j(400, { error: "Missing following_uid" });
        if (following_uid === user.uid) return j(400, { error: "Cannot follow yourself" });

        const sb = createClient(SUPABASE_URL, SERVICE_KEY);

        // ✅ tablo kolonları: follower_uid / following_uid
        const { data: existing, error: e1 } = await sb
            .from("follows")
            .select("id")
            .eq("follower_uid", user.uid)
            .eq("following_uid", following_uid)
            .maybeSingle();

        if (e1) return j(500, { error: e1.message });

        if (existing?.id) {
            const { error: delErr } = await sb.from("follows").delete().eq("id", existing.id);
            if (delErr) return j(500, { error: delErr.message });
            return j(200, { ok: true, following: false });
        }

        const { error: insErr } = await sb
            .from("follows")
            .insert([{ follower_uid: user.uid, following_uid }]);

        if (insErr) return j(500, { error: insErr.message });

        return j(200, { ok: true, following: true });
    } catch (e) {
        console.error("toggle_follow error:", e);
        return j(500, { error: e?.message || "Server error" });
    }
}
