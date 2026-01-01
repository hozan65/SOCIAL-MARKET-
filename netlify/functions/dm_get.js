// netlify/functions/dm_get.js (FIXED - env + safer output)
import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

const json = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
    },
    body: JSON.stringify(body),
});

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
            return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env" });
        }

        const conversation_id = String(event.queryStringParameters?.conversation_id || "").trim();
        if (!conversation_id) return json(400, { error: "Missing conversation_id" });

        const { user } = await getAppwriteUser(event);
        const me = user?.$id;
        if (!me) return json(401, { error: "Unauthorized" });

        // must be participant
        const { data: conv, error: e1 } = await sb
            .from("conversations")
            .select("id,user1_id,user2_id")
            .eq("id", conversation_id)
            .maybeSingle();

        if (e1) return json(500, { error: e1.message });
        if (!conv?.id) return json(404, { error: "Conversation not found" });
        if (conv.user1_id !== me && conv.user2_id !== me) return json(403, { error: "Forbidden" });

        const peerId = conv.user1_id === me ? conv.user2_id : conv.user1_id;

        // peer profile (optional)
        const { data: prof, error: e2 } = await sb
            .from("profiles")
            .select("appwrite_user_id,name,avatar_url")
            .eq("appwrite_user_id", peerId)
            .maybeSingle();

        if (e2) return json(500, { error: e2.message });

        // messages
        const { data: rows, error: e3 } = await sb
            .from("messages")
            .select("id,conversation_id,sender_id,body,created_at")
            .eq("conversation_id", conversation_id)
            .order("created_at", { ascending: true })
            .limit(500);

        if (e3) return json(500, { error: e3.message });

        return json(200, {
            ok: true,
            peer: {
                id: peerId,
                name: prof?.name || "User",
                avatar_url: prof?.avatar_url || "",
            },
            list: rows || [],
        });
    } catch (e) {
        const msg = String(e?.message || e);
        const status = msg.toLowerCase().includes("jwt") ? 401 : 500;
        return json(status, { error: msg });
    }
};
