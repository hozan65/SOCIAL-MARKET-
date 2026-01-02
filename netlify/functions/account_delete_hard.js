// netlify/functions/account_delete_hard.js  (FULL - HARD DELETE)
//
// Bu function:
// 1) JWT ile kullanıcıyı doğrular (Supabase auth.getUser)
// 2) Kullanıcıya ait tüm tabloları SIRALI şekilde siler
// 3) En son Supabase Auth user'ı admin ile siler
//
// ENV (Netlify):
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY   (ŞART)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

function json(statusCode, obj) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
        },
        body: JSON.stringify(obj),
    };
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env" });
        }

        const authHeader = event.headers.authorization || event.headers.Authorization || "";
        if (!authHeader.startsWith("Bearer ")) {
            return json(401, { error: "Missing Bearer token" });
        }

        const jwt = authHeader.replace("Bearer ", "").trim();

        // Service role client (admin yetkisi)
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
        });

        // ✅ JWT ile user doğrula
        const { data: u, error: uErr } = await sb.auth.getUser(jwt);
        if (uErr || !u?.user?.id) {
            return json(401, { error: "Invalid token" });
        }

        const uid = u.user.id;

        // ✅ helper: Supabase delete hatasını patlat
        async function del(q, label) {
            const { error } = await q;
            if (error) {
                throw new Error(`${label}: ${error.message}`);
            }
        }

        // =============================
        // 1) DB KAYITLARI (SIRALI)
        // =============================
        // messages: sender_id = uid
        await del(sb.from("messages").delete().eq("sender_id", uid), "delete messages");

        // conversations: user1_id OR user2_id = uid
        await del(
            sb.from("conversations").delete().or(`user1_id.eq.${uid},user2_id.eq.${uid}`),
            "delete conversations"
        );

        // follows: follower_uid OR following_uid = uid
        await del(
            sb.from("follows").delete().or(`follower_uid.eq.${uid},following_uid.eq.${uid}`),
            "delete follows"
        );

        // interactions: user_uid = uid
        await del(sb.from("interactions").delete().eq("user_uid", uid), "delete interactions");

        // post_comments: user_id = uid
        await del(sb.from("post_comments").delete().eq("user_id", uid), "delete post_comments");

        // post_likes: user_id = uid
        await del(sb.from("post_likes").delete().eq("user_id", uid), "delete post_likes");

        // analyses: author_uid = uid
        await del(sb.from("analyses").delete().eq("author_uid", uid), "delete analyses");

        // profiles: appwrite_user = uid
        // ⚠️ Sende primary column adı "appwrite_user" gibi görünüyor.
        // Eğer sende "appwrite_user_id" vs ise burayı değiştir.
        await del(sb.from("profiles").delete().eq("appwrite_user", uid), "delete profiles");

        // =============================
        // 2) AUTH USER (EN SON)
        // =============================
        const { error: delAuthErr } = await sb.auth.admin.deleteUser(uid);
        if (delAuthErr) {
            throw new Error(`delete auth user: ${delAuthErr.message}`);
        }

        return json(200, { ok: true, deleted_user: uid });
    } catch (e) {
        console.error("account_delete_hard ERROR:", e);
        return json(500, { error: String(e?.message || e) });
    }
};
