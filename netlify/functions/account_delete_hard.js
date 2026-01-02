// netlify/functions/account_delete_hard.js (FULL - Supabase hard delete)

import { createClient } from "@supabase/supabase-js";

function json(statusCode, obj) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(obj),
    };
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

        if (!SUPABASE_URL || !SRK) {
            return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
        }

        const auth = event.headers.authorization || event.headers.Authorization || "";
        if (!auth.startsWith("Bearer ")) return json(401, { error: "Missing Bearer token" });
        const jwt = auth.slice(7).trim();

        const sb = createClient(SUPABASE_URL, SRK, { auth: { persistSession: false } });

        // 1) JWT -> user
        const { data: u, error: uErr } = await sb.auth.getUser(jwt);
        if (uErr || !u?.user?.id) return json(401, { error: "Invalid token" });

        const uid = u.user.id;

        // helper: delete + throw on error
        async function del(promise, label) {
            const { error } = await promise;
            if (error) throw new Error(`${label}: ${error.message}`);
        }

        // 2) DB delete (ORDER MATTERS)
        // Kullanıcı mesajları
        await del(sb.from("messages").delete().eq("sender_id", uid), "messages");

        // Konuşmalar (user1/user2)
        await del(
            sb.from("conversations").delete().or(`user1_id.eq.${uid},user2_id.eq.${uid}`),
            "conversations"
        );

        // Follow ilişkileri
        await del(
            sb.from("follows").delete().or(`follower_uid.eq.${uid},following_uid.eq.${uid}`),
            "follows"
        );

        // Interactions (like/whatever)
        await del(sb.from("interactions").delete().eq("user_uid", uid), "interactions");

        // Post comment/like
        await del(sb.from("post_comments").delete().eq("user_id", uid), "post_comments");
        await del(sb.from("post_likes").delete().eq("user_id", uid), "post_likes");

        // Analyses
        await del(sb.from("analyses").delete().eq("author_uid", uid), "analyses");

        // Profiles (kolon adın farklıysa burayı değiştir!)
        // Ekranda "appwrite_user" görünüyor diye buna göre yazdım.
        await del(sb.from("profiles").delete().eq("appwrite_user", uid), "profiles");

        // 3) Auth user delete (LAST)
        const { error: delAuthErr } = await sb.auth.admin.deleteUser(uid);
        if (delAuthErr) throw new Error(`auth delete: ${delAuthErr.message}`);

        return json(200, { ok: true, deleted_user: uid });
    } catch (e) {
        console.error("account_delete_hard ERROR:", e);
        return json(500, { error: e?.message || String(e) });
    }
};
