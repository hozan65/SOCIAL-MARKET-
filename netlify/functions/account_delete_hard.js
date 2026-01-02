// netlify/functions/account_delete_hard.js
import { Client, Users } from "node-appwrite";
import { createClient } from "@supabase/supabase-js";

function json(statusCode, obj) {
    return {
        statusCode,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(obj),
    };
}

function getBearer(event) {
    const h = event.headers || {};
    const auth = h.authorization || h.Authorization || "";
    const m = String(auth).match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : null;
}

/**
 * ⚠️ ÖNEMLİ:
 * Bu function "Bearer token" içinden user id çıkaramaz.
 * O yüzden client tarafı, user id'yi de göndermeli:
 * body: { confirm:true, userId: "6956..." }
 *
 * Çünkü senin sm_jwt token'ın custom görünüyor.
 * Eğer token'dan userId decode ediyorsan, burada decode eklenir.
 */
export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT;
        const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
        const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

        // ✅ env check (en sık hata)
        const miss = [];
        if (!APPWRITE_ENDPOINT) miss.push("APPWRITE_ENDPOINT");
        if (!APPWRITE_PROJECT_ID) miss.push("APPWRITE_PROJECT_ID");
        if (!APPWRITE_API_KEY) miss.push("APPWRITE_API_KEY");
        if (!SUPABASE_URL) miss.push("SUPABASE_URL");
        if (!SUPABASE_SERVICE_ROLE_KEY) miss.push("SUPABASE_SERVICE_ROLE_KEY");
        if (miss.length) return json(500, { error: "Missing envs", missing: miss });

        // auth token var mı?
        const token = getBearer(event);
        if (!token) return json(401, { error: "Missing Authorization Bearer token" });

        let body = {};
        try { body = event.body ? JSON.parse(event.body) : {}; } catch {}

        // ✅ client buraya userId gönderecek
        const userId = body.userId || body.uid || null;
        if (!userId) {
            return json(400, {
                error: "Missing userId in body",
                hint: "Send {confirm:true, userId: localStorage.getItem('sm_uid') }",
            });
        }

        // 1) Supabase cleanup
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // senin tablolarına göre silme listesi (screenlerde görünenler)
        // text alanlar: profiles.appwrite_user_id, follows.follower_uid/following_uid, conversations.user1_id/user2_id, messages.sender_id
        // post_likes.user_id, post_comments.user_id, interactions.user_uid, analyses.author_uid
        const deletions = [];

        // profiles
        deletions.push(sb.from("profiles").delete().eq("appwrite_user_id", userId));

        // follows
        deletions.push(sb.from("follows").delete().eq("follower_uid", userId));
        deletions.push(sb.from("follows").delete().eq("following_uid", userId));

        // conversations + messages (FK var: messages.conversation_id -> conversations.id)
        // önce messages, sonra conversations
        // kullanıcının dahil olduğu conversation id'leri bul
        const convRes = await sb
            .from("conversations")
            .select("id")
            .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

        if (convRes.error) {
            return json(500, { error: "Supabase conversations select failed", details: convRes.error });
        }

        const convIds = (convRes.data || []).map((x) => x.id).filter(Boolean);

        if (convIds.length) {
            deletions.push(sb.from("messages").delete().in("conversation_id", convIds));
        }

        deletions.push(sb.from("messages").delete().eq("sender_id", userId));
        deletions.push(sb.from("conversations").delete().or(`user1_id.eq.${userId},user2_id.eq.${userId}`));

        // interactions
        deletions.push(sb.from("interactions").delete().eq("user_uid", userId));

        // analyses
        deletions.push(sb.from("analyses").delete().eq("author_uid", userId));

        // likes/comments
        deletions.push(sb.from("post_likes").delete().eq("user_id", userId));
        deletions.push(sb.from("post_comments").delete().eq("user_id", userId));

        // news / news_feed user bağlı değil (sende user alanı yok gibi) -> dokunmuyoruz

        const delResults = await Promise.all(deletions);
        const supabaseErrors = delResults
            .map((r) => r.error)
            .filter(Boolean);

        if (supabaseErrors.length) {
            return json(500, { error: "Supabase delete failed", details: supabaseErrors });
        }

        // 2) Appwrite user hard delete
        const client = new Client()
            .setEndpoint(APPWRITE_ENDPOINT)
            .setProject(APPWRITE_PROJECT_ID)
            .setKey(APPWRITE_API_KEY);

        const users = new Users(client);

        // Appwrite'ta user sil
        try {
            await users.delete(userId);
        } catch (e) {
            return json(500, {
                error: "Appwrite delete user failed",
                details: e?.message || String(e),
            });
        }

        return json(200, { ok: true, deleted: true, userId });

    } catch (e) {
        return json(500, { error: "Unhandled server error", details: e?.message || String(e) });
    }
};
