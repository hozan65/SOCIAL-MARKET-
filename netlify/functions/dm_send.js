// netlify/functions/dm_send.js
import { getAppwriteUser } from "./_appwrite_user.js";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const { user } = await getAppwriteUser(event);
        const from_id = user.$id;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
            throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env");
        }
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        const body = JSON.parse(event.body || "{}");
        let { conversation_id, to_id, text, client_id } = body;

        if (!to_id) return json(400, { error: "Missing to_id" });
        if (!text || !String(text).trim()) return json(400, { error: "Missing text" });

        // convo yoksa bul/oluştur (user1_id/user2_id)
        if (!conversation_id) {
            const { data: existing, error: e1 } = await sb
                .from("conversations")
                .select("id,user1_id,user2_id")
                .or(
                    `and(user1_id.eq.${from_id},user2_id.eq.${to_id}),and(user1_id.eq.${to_id},user2_id.eq.${from_id})`
                )
                .limit(1);

            if (e1) throw new Error(e1.message);

            if (existing && existing[0]) {
                conversation_id = existing[0].id;
            } else {
                const { data: created, error: e2 } = await sb
                    .from("conversations")
                    .insert([{ user1_id: from_id, user2_id: to_id }])
                    .select("id")
                    .single();

                if (e2) throw new Error(e2.message);
                conversation_id = created.id;
            }
        } else {
            // convo user'a ait mi?
            const { data: convo, error: e0 } = await sb
                .from("conversations")
                .select("id,user1_id,user2_id")
                .eq("id", conversation_id)
                .single();
            if (e0) throw new Error(e0.message);
            if (!(convo.user1_id === from_id || convo.user2_id === from_id)) {
                return json(403, { error: "Forbidden" });
            }
        }

        // insert message
        const { data: row, error: e3 } = await sb
            .from("messages")
            .insert([{
                conversation_id,
                from_id,
                to_id,
                text: String(text),
                client_id: client_id || null,
            }])
            .select("id,conversation_id,from_id,to_id,text,created_at,client_id")
            .single();

        if (e3) throw new Error(e3.message);

        // bump updated_at (RLS yok çünkü service role)
        await sb
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversation_id);

        return json(200, { ok: true, conversation_id, row });
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
