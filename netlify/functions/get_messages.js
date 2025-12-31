// netlify/functions/get_messages.js
import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        // 🔐 user doğrula
        await getAppwriteUser(event);

        const conversation_id = String(event.queryStringParameters?.conversation_id || "").trim();
        const limit = Math.min(Math.max(Number(event.queryStringParameters?.limit || 200), 1), 500);

        if (!conversation_id) return json(400, { error: "Missing conversation_id" });

        const { data, error } = await sb
            .from("messages")
            .select("*")
            .eq("conversation_id", conversation_id)
            .order("created_at", { ascending: true })
            .limit(limit);

        if (error) return json(500, { error: error.message });

        return json(200, { ok: true, conversation_id, messages: data || [] });
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
