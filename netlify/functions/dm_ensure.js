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

        const a = me, b = peer_id;

        const { data: existing, error: e1 } = await sb
            .from("conversations")
            .select("id,user_a,user_b")
            .or(`and(user_a.eq.${a},user_b.eq.${b}),and(user_a.eq.${b},user_b.eq.${a})`)
            .limit(1);

        if (e1) throw new Error(e1.message);

        if (existing && existing[0]) {
            return json(200, { ok: true, conversation_id: existing[0].id, existing: true });
        }

        const { data: created, error: e2 } = await sb
            .from("conversations")
            .insert([{ user_a: a, user_b: b, last_message: "", last_at: new Date().toISOString() }])
            .select("id")
            .single();

        if (e2) throw new Error(e2.message);

        return json(200, { ok: true, conversation_id: created.id, existing: false });
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
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
