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
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    },
    body: JSON.stringify(body)
});

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        const conversation_id = (event.queryStringParameters?.conversation_id || "").trim();
        const limit = Math.min(Number(event.queryStringParameters?.limit || 50), 100);

        if (!conversation_id) return json(400, { error: "Missing 'conversation_id' param" });

        const { user } = await getAppwriteUser(event);
        const me = user?.$id;
        if (!me) return json(401, { error: "Unauthorized" });

        // yetki: konuşmanın tarafı mı?
        const { data: conv, error: e1 } = await supabase
            .from("conversations")
            .select("id,user1_id,user2_id")
            .eq("id", conversation_id)
            .maybeSingle();

        if (e1) return json(500, { error: e1.message });
        if (!conv?.id) return json(404, { error: "Conversation not found" });
        if (conv.user1_id !== me && conv.user2_id !== me) return json(403, { error: "Forbidden" });

        const { data: rows, error: e2 } = await supabase
            .from("messages")
            .select("id,conversation_id,sender_id,body,created_at")
            .eq("conversation_id", conversation_id)
            .order("created_at", { ascending: true })
            .limit(limit);

        if (e2) return json(500, { error: e2.message });

        return json(200, { ok: true, list: rows || [] });
    } catch (e) {
        return json(500, { error: String(e?.message || e) });
    }
};
