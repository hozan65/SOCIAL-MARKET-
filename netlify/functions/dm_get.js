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

        // conversation doğrula
        const { data: convo, error: e1 } = await sb
            .from("conversations")
            .select("id,user_a,user_b")
            .eq("id", conversation_id)
            .single();

        if (e1) throw new Error(e1.message);
        if (!(convo.user_a === uid || convo.user_b === uid)) return json(403, { error: "Forbidden" });

        const peer_id = convo.user_a === uid ? convo.user_b : convo.user_a;

        const { data, error } = await sb
            .from("messages")
            .select("id,conversation_id,from_id,to_id,text,created_at,client_id")
            .eq("conversation_id", conversation_id)
            .order("created_at", { ascending: true });

        if (error) throw new Error(error.message);

        return json(200, { ok: true, peer_id, rows: data || [] });
    } catch (e) {
        const msg = String(e?.message || e);
        const low = msg.toLowerCase();
        const status = low.includes("jwt") ? 401 : 500;
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
