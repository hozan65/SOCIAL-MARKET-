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
            throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env");
        }
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        const qs = event.queryStringParameters || {};
        const conversation_id = String(qs.conversation_id || "").trim();
        if (!conversation_id) return json(400, { error: "Missing conversation_id" });

        // 1) authorize: user must be in conversation
        const { data: convo, error: eC } = await sb
            .from("conversations")
            .select("id,user1_id,user2_id")
            .eq("id", conversation_id)
            .single();
        if (eC) throw new Error(eC.message);

        if (!(convo.user1_id === uid || convo.user2_id === uid)) {
            return json(403, { error: "Forbidden" });
        }

        // 2) fetch messages
        const limit = Math.min(Number(qs.limit || 200), 500);
        const { data: rows, error: eM } = await sb
            .from("messages")
            .select("id,conversation_id,sender_id,body,created_at,read_at")
            .eq("conversation_id", conversation_id)
            .order("created_at", { ascending: true })
            .limit(limit);

        if (eM) throw new Error(eM.message);

        return json(200, { ok: true, list: rows || [] });
    } catch (e) {
        const msg = String(e?.message || e);
        const status = msg.toLowerCase().includes("jwt") ? 401 : 502;
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
