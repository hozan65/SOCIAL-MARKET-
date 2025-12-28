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
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
    body: JSON.stringify(body),
});

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        const { user } = await getAppwriteUser(event);
        const me = user?.$id;
        if (!me) return json(401, { error: "Unauthorized" });

        const q = event.queryStringParameters || {};
        const limit = Math.min(parseInt(q.limit || "60", 10), 100);

        // ✅ conversations: user1_id / user2_id
        const { data: convs, error: e1 } = await supabase
            .from("conversations")
            .select("id,user1_id,user2_id,created_at,updated_at")
            .or(`user1_id.eq.${me},user2_id.eq.${me}`)
            .order("updated_at", { ascending: false })
            .limit(limit);

        if (e1) return json(500, { error: e1.message });
        const convList = convs || [];
        if (!convList.length) return json(200, { ok: true, list: [] });

        const convIds = convList.map((c) => c.id);
        const otherIds = convList.map((c) => (c.user1_id === me ? c.user2_id : c.user1_id));

        // ✅ profiles: PRIMARY KEY = appwrite_user_id (SENDE BU VAR)
        const { data: profs, error: e2 } = await supabase
            .from("profiles")
            .select("appwrite_user_id,name,avatar_url")
            .in("appwrite_user_id", otherIds);

        if (e2) return json(500, { error: e2.message });
        const profMap = new Map((profs || []).map((p) => [p.appwrite_user_id, p]));

        // ✅ last message per conversation
        const { data: msgs, error: e3 } = await supabase
            .from("messages")
            .select("conversation_id,body,created_at,sender_id,read_at")
            .in("conversation_id", convIds)
            .order("created_at", { ascending: false })
            .limit(500);

        if (e3) return json(500, { error: e3.message });

        const lastMap = new Map();
        for (const m of msgs || []) {
            if (!lastMap.has(m.conversation_id)) lastMap.set(m.conversation_id, m);
        }

        // ✅ unread counts
        const { data: unreadRows, error: e4 } = await supabase
            .from("messages")
            .select("conversation_id")
            .in("conversation_id", convIds)
            .is("read_at", null)
            .neq("sender_id", me)
            .limit(4000);

        if (e4) return json(500, { error: e4.message });

        const unreadMap = new Map();
        for (const r of unreadRows || []) {
            unreadMap.set(r.conversation_id, (unreadMap.get(r.conversation_id) || 0) + 1);
        }

        // ✅ output
        const list = convList.map((c) => {
            const otherId = c.user1_id === me ? c.user2_id : c.user1_id;
            const p = profMap.get(otherId) || {};
            const last = lastMap.get(c.id) || null;

            return {
                conversation_id: c.id,
                other_id: otherId,
                other_name: p.name || "User",
                other_avatar_url: p.avatar_url || "",
                last_body: last?.body || "",
                last_at: last?.created_at || c.updated_at || c.created_at || null,
                unread: unreadMap.get(c.id) || 0,
            };
        });

        return json(200, { ok: true, list });
    } catch (e) {
        return json(500, { error: String(e?.message || e) });
    }
};
