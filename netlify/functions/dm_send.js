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
        const sender_id = user.$id;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
            throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env");
        }
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        const body = JSON.parse(event.body || "{}");
        let { conversation_id, text, peer_id, is_private } = body;

        // text/body
        const msgBody = String(text ?? body.body ?? "").trim();
        if (!msgBody) return json(400, { error: "Missing text" });

        // conversation_id yoksa peer_id ile ensure yap
        if (!conversation_id) {
            const p = String(peer_id || "").trim();
            if (!p) return json(400, { error: "Missing conversation_id or peer_id" });
            if (p === sender_id) return json(400, { error: "peer_id cannot be self" });

            const { data: existing, error: e1 } = await sb
                .from("conversations")
                .select("id,user1_id,user2_id")
                .or(
                    `and(user1_id.eq.${sender_id},user2_id.eq.${p}),and(user1_id.eq.${p},user2_id.eq.${sender_id})`
                )
                .limit(1);

            if (e1) throw new Error(e1.message);

            if (existing && existing[0]) conversation_id = existing[0].id;
            else {
                const { data: created, error: e2 } = await sb
                    .from("conversations")
                    .insert([{ user1_id: sender_id, user2_id: p }])
                    .select("id")
                    .single();
                if (e2) throw new Error(e2.message);
                conversation_id = created.id;
            }
        }

        // convo auth + peer determine
        const { data: convo, error: eC } = await sb
            .from("conversations")
            .select("id,user1_id,user2_id")
            .eq("id", conversation_id)
            .single();
        if (eC) throw new Error(eC.message);

        if (!(convo.user1_id === sender_id || convo.user2_id === sender_id)) {
            return json(403, { error: "Forbidden" });
        }

        const peer = convo.user1_id === sender_id ? convo.user2_id : convo.user1_id;

        // insert message
        const now = new Date().toISOString();
        const { data: row, error: e3 } = await sb
            .from("messages")
            .insert([{
                conversation_id,
                sender_id,
                body: msgBody,
                event: "dm",
                private: is_private ?? true,
                inserted_at: now,
                updated_at: now,
            }])
            .select("id,conversation_id,sender_id,body,created_at,inserted_at,updated_at,read_at,private,event")
            .single();

        if (e3) throw new Error(e3.message);

        // bump conversation updated_at
        await sb
            .from("conversations")
            .update({ updated_at: now })
            .eq("id", conversation_id);

        // normalize for UI
        const normalized = {
            id: row.id,
            conversation_id: row.conversation_id,
            from_id: row.sender_id,
            to_id: peer, // UI convenience (table doesn't store it)
            text: row.body,
            created_at: row.created_at || row.inserted_at || now,
            raw: row,
        };

        return json(200, { ok: true, conversation_id, peer_id: peer, row: normalized });
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
