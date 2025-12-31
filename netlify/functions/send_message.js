// netlify/functions/send_message.js
import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        // 🔐 Appwrite JWT -> user
        const { user } = await getAppwriteUser(event);
        const sender_id = user.$id;

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch {}

        const conversation_id = String(body.conversation_id || "").trim();
        const text = String(body.body || "").trim();

        if (!conversation_id) return json(400, { error: "Missing conversation_id" });
        if (!text) return json(400, { error: "Missing body" });

        // (Opsiyonel) conversation var mı kontrolü:
        // Eğer conversations tablon farklıysa bunu kaldırabilirsin.
        // Sadece FK hatası alıyorsan aç:
        /*
        const { data: conv, error: convErr } = await sb
          .from("conversations")
          .select("id")
          .eq("id", conversation_id)
          .maybeSingle();
        if (convErr) return json(500, { error: convErr.message });
        if (!conv?.id) return json(400, { error: "Conversation not found" });
        */

        const { data, error } = await sb
            .from("messages")
            .insert([{ conversation_id, sender_id, body: text }])
            .select("*")
            .single();

        if (error) return json(500, { error: error.message });

        return json(200, { ok: true, message: data });
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
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
