// netlify/functions/ai_get_messages.js (FULL) - uses ai_messages.sid (uuid)
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,x-user-id",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
};

const json = (statusCode, body) => ({
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
});

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        const uid = (event.headers["x-user-id"] || event.headers["X-User-Id"] || "").trim();
        const sid = (event.queryStringParameters?.session_id || "").trim(); // frontend still sends session_id

        console.log("DEBUG uid:", uid);
        console.log("DEBUG sid:", sid);

        if (!uid) return json(401, { error: "missing_uid" });
        if (!sid) return json(400, { error: "missing_session_id" });

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
            return json(500, { error: "missing_supabase_env" });
        }

        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        const { data, error } = await sb
            .from("ai_messages")
            .select("role, content, created_at")
            .eq("user_id", uid)
            .eq("sid", sid) // ✅ session filter uses sid
            .order("created_at", { ascending: true })
            .limit(200);

        if (error) return json(500, { error: "db_error", details: error });

        return json(200, { messages: data || [] });
    } catch (e) {
        console.log("SERVER error:", e);
        return json(500, { error: "server_error", message: e.message });
    }
};
