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
            console.error("Missing supabase env", { hasUrl: !!SUPABASE_URL, hasKey: !!SUPABASE_KEY });
            return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
        }

        const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

        // 🔐 Appwrite user
        const { user } = await getAppwriteUser(event);
        if (!user?.$id) return json(401, { error: "Unauthorized (missing/invalid jwt)" });
        const myUid = user.$id;

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch {}

        const following_uid = String(body.following_uid || body.following_id || "").trim();
        if (!following_uid) return json(400, { error: "Missing following_uid" });
        if (following_uid === myUid) return json(400, { error: "Cannot follow yourself" });

        // ✅ FK FIX: profiles tablosunda iki kullanıcı da olsun (yoksa insert patlar)
        // profiles tablonun PK'si "id" ise bu çalışır.
        const p1 = await sb.from("profiles").upsert([{ id: myUid }], { onConflict: "id" });
        if (p1.error) return json(500, { error: `profiles upsert (me) failed: ${p1.error.message}` });

        const p2 = await sb.from("profiles").upsert([{ id: following_uid }], { onConflict: "id" });
        if (p2.error) return json(500, { error: `profiles upsert (target) failed: ${p2.error.message}` });

        // 🔎 mevcut ilişki var mı?
        const { data: existing, error: e1 } = await sb
            .from("follows")
            .select("id")
            .eq("follower_uid", myUid)
            .eq("following_uid", following_uid)
            .maybeSingle();

        if (e1) return json(500, { error: e1.message });

        let following = false;

        // 🔁 toggle
        if (existing?.id) {
            const { error: delErr } = await sb.from("follows").delete().eq("id", existing.id);
            if (delErr) return json(500, { error: delErr.message });
            following = false;
        } else {
            const { error: insErr } = await sb
                .from("follows")
                .insert([{ follower_uid: myUid, following_uid }]);
            if (insErr) return json(500, { error: insErr.message });
            following = true;
        }

        // ✅ counts
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
        const msg = String(e?.message || e);
        console.error("toggle_follow error:", msg);
        const status = msg.toLowerCase().includes("jwt") ? 401 : 500;
        return json(status, { error: msg });
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
