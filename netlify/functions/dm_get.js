// netlify/functions/dm_get.js
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

        const q = event.queryStringParameters || {};
        const conversation_id = q.conversation_id || "";
        if (!conversation_id) return json(400, { error: "Missing conversation_id" });

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
            throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env");
        }
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        const { data: convo, error: e1 } = await sb
            .from("conversations")
            .select("id,user1_id,user2_id")
            .eq("id", conversation_id)
            .single();
        if (e1) throw new Error(e1.message);

        if (!(convo.user1_id === uid || convo.user2_id === uid)) return json(403, { error: "Forbidden" });

        const peer_id = convo.user1_id === uid ? convo.user2_id : convo.user1_id;

        // ✅ only columns that exist (NO inserted_at)
        const { data: rows, error: e2 } = await sb
            .from("messages")
            .select("id,conversation_id,sender_id,body,created_at,updated_at,read_at")
            .eq("conversation_id", conversation_id)
            .order("created_at", { ascending: true });

        if (e2) throw new Error(e2.message);

        const normalized = (rows || []).map((m) => ({
            id: m.id,
            conversation_id: m.conversation_id,
            from_id: m.sender_id,
            text: m.body,
            created_at: m.created_at || m.updated_at || null,
            raw: m,
        }));

        return json(200, { ok: true, peer_id, rows: normalized });
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
