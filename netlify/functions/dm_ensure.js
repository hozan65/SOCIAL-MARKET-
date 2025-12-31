// netlify/functions/dm_ensure.js
import { getAppwriteUser } from "./_appwrite_user.js";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
            return json(405, { error: "Method not allowed" });
        }

        const { user } = await getAppwriteUser(event);
        const me = user.$id;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
            throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env");
        }
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        const qs = event.queryStringParameters || {};
        const body = event.httpMethod === "POST" ? JSON.parse(event.body || "{}") : {};
        const peer_id = body.peer_id || qs.peer_id || "";

        if (!peer_id) return json(400, { error: "Missing peer_id" });
        if (peer_id === me) return json(400, { error: "peer_id cannot be self" });

        // existing conversation?
        const { data: existing, error: e1 } = await sb
            .from("conversations")
            .select("id,user1_id,user2_id")
            .or(
                `and(user1_id.eq.${me},user2_id.eq.${peer_id}),and(user1_id.eq.${peer_id},user2_id.eq.${me})`
            )
            .limit(1);

        if (e1) throw new Error(e1.message);

        if (existing && existing[0]) {
            return json(200, { ok: true, conversation_id: existing[0].id, existing: true });
        }

        // create conversation
        const { data: created, error: e2 } = await sb
            .from("conversations")
            .insert([{ user1_id: me, user2_id: peer_id }])
            .select("id")
            .single();

        if (e2) throw new Error(e2.message);

        return json(200, { ok: true, conversation_id: created.id, existing: false });
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
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
