// netlify/functions/dm_inbox.js (FIXED - uses profiles.appwrite_user_id + returns peer_name)
import { getAppwriteUser } from "./_appwrite_user.js";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        const { user } = await getAppwriteUser(event);
        const uid = user.$id;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
            throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE(_KEY) env");
        }
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        // 1) Conversations
        const { data: convos, error: e1 } = await sb
            .from("conversations")
            .select("id,user1_id,user2_id,updated_at,created_at")
            .or(`user1_id.eq.${uid},user2_id.eq.${uid}`)
            .order("updated_at", { ascending: false });

        if (e1) throw new Error(e1.message);

        if (!convos?.length) return json(200, { ok: true, list: [] });

        // 2) Last message per conversation
        const ids = convos.map((c) => c.id);
        const lastByConvo = new Map();

        const { data: msgs, error: e2 } = await sb
            .from("messages")
            .select("conversation_id,body,created_at")
            .in("conversation_id", ids)
            .order("created_at", { ascending: false });

        if (e2) throw new Error(e2.message);

        for (const m of msgs || []) {
            if (!lastByConvo.has(m.conversation_id)) lastByConvo.set(m.conversation_id, m);
        }

        // 3) Peer ids
        const peerIds = convos.map((c) => (c.user1_id === uid ? c.user2_id : c.user1_id));

        // 4) Profiles by appwrite_user_id (SENDE BU ALAN VAR)
        const { data: profiles, error: e3 } = await sb
            .from("profiles")
            .select("appwrite_user_id,name,avatar_url")
            .in("appwrite_user_id", peerIds);

        if (e3) throw new Error(e3.message);

        const profByUid = new Map((profiles || []).map((p) => [p.appwrite_user_id, p]));

        // 5) Final list (FRONTEND İÇİN: peer_name + peer_avatar)
        const list = convos.map((c) => {
            const peer_id = c.user1_id === uid ? c.user2_id : c.user1_id;
            const prof = profByUid.get(peer_id);
            const last = lastByConvo.get(c.id);

            return {
                conversation_id: c.id,
                peer_id,
                peer_name: prof?.name || "Unknown user",
                peer_avatar: prof?.avatar_url || null,
                last_message: last?.body ? String(last.body) : "",
                last_at: last?.created_at || c.updated_at || c.created_at || null,
            };
        });

        return json(200, { ok: true, list });
    } catch (e) {
        const msg = String(e?.message || e);
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
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
