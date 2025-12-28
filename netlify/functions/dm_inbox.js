import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const json = (status, body) => ({
    statusCode: status,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT, x-jwt",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    },
    body: JSON.stringify(body)
});

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        // 🔐 current user
        const { user } = await getAppwriteUser(event);
        const me = user?.$id;
        if (!me) return json(401, { error: "Unauthorized" });

        // 📌 conversations where I'm user_id OR user2_id
        const { data: convs, error: e1 } = await supabase
            .from("conversations")
            .select("id, user_id, user2_id, created_at, updated_at")
            .or(`user_id.eq.${me},user2_id.eq.${me}`)
            .order("updated_at", { ascending: false });

        if (e1) return json(500, { error: e1.message });
        if (!convs || !convs.length) {
            return json(200, { ok: true, list: [] });
        }

        // 👤 other user ids
        const otherIds = convs.map(c =>
            c.user_id === me ? c.user2_id : c.user_id
        );

        // 👤 profiles
        const { data: profs, error: e2 } = await supabase
            .from("profiles")
            .select("id, name, avatar_url")
            .in("id", otherIds);

        if (e2) return json(500, { error: e2.message });

        const profMap = new Map((profs || []).map(p => [p.id, p]));

        // 💬 last messages
        const convIds = convs.map(c => c.id);

        const { data: msgs, error: e3 } = await supabase
            .from("messages")
            .select("conversation_id, body, created_at, sender_id, read_at")
            .in("conversation_id", convIds)
            .order("created_at", { ascending: false });

        if (e3) return json(500, { error: e3.message });

        const lastMsgMap = new Map();
        for (const m of msgs || []) {
            if (!lastMsgMap.has(m.conversation_id)) {
                lastMsgMap.set(m.conversation_id, m);
            }
        }

        // 🔵 unread counts
        const { data: unreadRows, error: e4 } = await supabase
            .from("messages")
            .select("conversation_id")
            .in("conversation_id", convIds)
            .is("read_at", null)
            .neq("sender_id", me);

        if (e4) return json(500, { error: e4.message });

        const unreadMap = new Map();
        for (const r of unreadRows || []) {
            unreadMap.set(
                r.conversation_id,
                (unreadMap.get(r.conversation_id) || 0) + 1
            );
        }

        // 🧠 final list
        const list = convs.map(c => {
            const otherId = c.user_id === me ? c.user2_id : c.user_id;
            const profile = profMap.get(otherId) || {};
            const last = lastMsgMap.get(c.id) || {};

            return {
                conversation_id: c.id,
                other_id: otherId,
                other_name: profile.name || "User",
                other_avatar_url: profile.avatar_url || "",
                last_body: last.body || "",
                last_at: last.created_at || c.updated_at || c.created_at,
                unread: unreadMap.get(c.id) || 0
            };
        });

        return json(200, { ok: true, list });
    } catch (e) {
        return json(500, { error: String(e?.message || e) });
    }
};
