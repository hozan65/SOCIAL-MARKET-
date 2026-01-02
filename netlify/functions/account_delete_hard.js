// netlify/functions/account_delete_hard.js
import { Client, Account, Users } from "node-appwrite";
import { createClient as createSupabase } from "@supabase/supabase-js";

const {
    APPWRITE_ENDPOINT,
    APPWRITE_PROJECT_ID,
    APPWRITE_API_KEY,

    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const auth = event.headers.authorization || event.headers.Authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!token) return json(401, { error: "Invalid token" });

        if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
            return json(500, { error: "Missing Appwrite envs" });
        }
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return json(500, { error: "Missing Supabase envs" });
        }

        // 1) Appwrite JWT verify -> get user
        const aw = new Client()
            .setEndpoint(APPWRITE_ENDPOINT)
            .setProject(APPWRITE_PROJECT_ID)
            .setKey(APPWRITE_API_KEY);

        // JWT ile "account.get" yapabilmek için ayrı client:
        const awJwt = new Client()
            .setEndpoint(APPWRITE_ENDPOINT)
            .setProject(APPWRITE_PROJECT_ID)
            .setJWT(token);

        const account = new Account(awJwt);
        const me = await account.get(); // token valid mi?
        const uid = me?.$id;
        if (!uid) return json(401, { error: "Invalid token user" });

        // 2) Supabase hard delete (service role)
        const sb = createSupabase(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Senin tablolarına göre temizliyoruz:
        // profiles: appwrite_user_id
        // follows: follower_uid / following_uid
        // conversations: user1_id / user2_id
        // messages: sender_id + conversation_id (FK)
        // post_likes: user_id
        // post_comments: user_id
        // interactions: user_uid
        // analyses: author_uid

        // messages -> conversations sırası önemli (FK var)
        await sb.from("messages").delete().or(`sender_id.eq.${uid}`);
        await sb.from("conversations").delete().or(`user1_id.eq.${uid},user2_id.eq.${uid}`);

        await sb.from("follows").delete().or(`follower_uid.eq.${uid},following_uid.eq.${uid}`);
        await sb.from("post_likes").delete().eq("user_id", uid);
        await sb.from("post_comments").delete().eq("user_id", uid);
        await sb.from("interactions").delete().eq("user_uid", uid);
        await sb.from("analyses").delete().eq("author_uid", uid);

        await sb.from("profiles").delete().eq("appwrite_user_id", uid);

        // 3) Appwrite user delete (hard)
        const users = new Users(aw);
        await users.delete(uid);

        return json(200, { ok: true, deleted: uid });
    } catch (e) {
        console.error("account_delete_hard error:", e);
        return json(500, { error: "Server error", detail: String(e?.message || e) });
    }
};
