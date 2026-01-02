// netlify/functions/account_delete_hard.js  (CommonJS - Netlify friendly)

const { Client, Account, Users } = require("node-appwrite");
const { createClient } = require("@supabase/supabase-js");

function json(statusCode, obj) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(obj),
    };
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const auth = event.headers.authorization || event.headers.Authorization || "";
        const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!jwt) return json(401, { error: "Missing Bearer token" });

        const {
            APPWRITE_ENDPOINT,
            APPWRITE_PROJECT_ID,
            APPWRITE_API_KEY, // ✅ server admin key
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY, // ✅ service role
        } = process.env;

        if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
            return json(500, { error: "Missing APPWRITE env vars" });
        }
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return json(500, { error: "Missing SUPABASE env vars" });
        }

        // 1) JWT ile kullanıcıyı bul (Appwrite Account.get)
        const userClient = new Client()
            .setEndpoint(APPWRITE_ENDPOINT)
            .setProject(APPWRITE_PROJECT_ID)
            .setJWT(jwt);

        const account = new Account(userClient);
        const me = await account.get();
        const userId = me && me.$id;
        if (!userId) return json(401, { error: "Invalid token" });

        // 2) Supabase hard delete
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // ⚠️ TABLO İSİMLERİN farklıysa burayı değiştir.
        // Table yoksa hata verirse ignore ediyoruz.
        const ops = [
            () => sb.from("likes").delete().eq("user_id", userId),
            () => sb.from("comments").delete().eq("user_id", userId),
            () => sb.from("posts").delete().eq("user_id", userId),
            () => sb.from("follows").delete().or(`from_id.eq.${userId},to_id.eq.${userId}`),
            () => sb.from("notifications").delete().or(`user_id.eq.${userId},actor_id.eq.${userId}`),
            () => sb.from("dm_messages").delete().or(`from_id.eq.${userId},to_id.eq.${userId}`),
            () => sb.from("dm_inbox").delete().or(`user_id.eq.${userId},peer_id.eq.${userId}`),
            () => sb.from("user_settings").delete().eq("user_id", userId),
            () => sb.from("profiles").delete().eq("id", userId),
        ];

        for (const run of ops) {
            const { error } = await run();
            if (error) {
                const msg = String(error.message || error);
                // tablo yoksa ignore
                const low = msg.toLowerCase();
                if (!low.includes("does not exist") && !low.includes("unknown")) {
                    return json(500, { error: "Supabase delete failed: " + msg });
                }
            }
        }

        // 3) Appwrite user delete (Admin)
        const admin = new Client()
            .setEndpoint(APPWRITE_ENDPOINT)
            .setProject(APPWRITE_PROJECT_ID)
            .setKey(APPWRITE_API_KEY);

        const users = new Users(admin);
        await users.delete(userId);

        return json(200, { ok: true });
    } catch (e) {
        return json(500, { error: e?.message || "Server error" });
    }
};
