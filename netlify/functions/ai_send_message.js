// netlify/functions/ai_send_message.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

const json = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,x-user-id",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
    body: JSON.stringify(body),
});

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const uid = (event.headers["x-user-id"] || "").trim();
        if (!uid) return json(401, { error: "missing_uid" });

        const body = JSON.parse(event.body || "{}");
        const session_id = body.session_id;
        const text = (body.text || "").trim();

        if (!session_id) return json(400, { error: "missing_session_id" });
        if (!text) return json(400, { error: "missing_text" });

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
            return json(500, { error: "missing_supabase_env" });
        }

        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        // 1) save user msg
        const ins1 = await sb.from("ai_messages").insert({
            user_id: uid,
            session_id,
            role: "user",
            content: text,
        });
        if (ins1.error) return json(500, { error: "db_insert_user_failed", details: ins1.error });

        // 2) produce reply (TEMP)
        // TODO: burada senin gerçek Signal AI logic'in / OpenAI çağrın olacak
        const reply = `✅ Aldım: ${text}`;

        // 3) save assistant msg
        const ins2 = await sb.from("ai_messages").insert({
            user_id: uid,
            session_id,
            role: "assistant",
            content: reply,
        });
        if (ins2.error) return json(500, { error: "db_insert_ai_failed", details: ins2.error });

        return json(200, { ok: true, reply });
    } catch (e) {
        return json(500, { error: "server_error", message: e.message });
    }
};
