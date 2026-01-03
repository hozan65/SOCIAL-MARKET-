import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,x-user-id",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const json = (statusCode, body) => ({
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
});

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });

        const uid = (event.headers["x-user-id"] || event.headers["X-User-Id"] || "").trim();
        if (!uid) return json(401, { error: "missing_uid" });

        const body = JSON.parse(event.body || "{}");
        const title = (body.title || "New chat").toString().slice(0, 120);

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
            return json(500, { error: "missing_supabase_env" });
        }

        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        const { data, error } = await sb
            .from("ai_sessions")
            .insert({ user_id: uid, title })
            .select("sid, title, created_at")
            .single();

        if (error) return json(500, { error: "db_error", details: error });

        return json(200, { session: data });
    } catch (e) {
        console.log("ai_create_session server_error:", e);
        return json(500, { error: "server_error", message: e.message });
    }
};
