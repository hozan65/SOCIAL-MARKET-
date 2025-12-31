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
        let { conversation_id, text, peer_id } = body;

        const msgBody = String(text ?? "").trim();
        if (!msgBody) return json(400, { error: "Missing text" });

        // ------------------------------------------
        // ensure conversation if missing (ORDERED)
        // ------------------------------------------
        if (!conversation_id) {
            const p = String(peer_id || "").trim();
            if (!p) return json(400, { error: "Missing conversation_id or peer_id" });
            if (p === sender_id) return json(400, { error: "peer_id cannot be self" });

            // ✅ ORDER IDs to satisfy conversations_ordered constraint
            const a = sender_id < p ? sender_id : p;
            const b = sender_id < p ? p : sender_id;

            // Find existing conversation in ordered columns
            const { data: existing, error: e1 } = await sb
                .from("conversations")
                .select("id,user1_id,user2_id")
                .eq("user1_id", a)
                .eq("user2_id", b)
                .limit(1);

            if (e1) throw new Error(e1.message);

            if (existing && existing[0]) {
                conversation_id = existing[0].id;
            } else {
                const { data: created, error: e2 } = await sb
                    .from("conversations")
                    .insert([{ user1_id: a, user2_id: b }])
                    .select("id,user1_id,user2_id")
                    .single();

                if (e2) throw new Error(e2.message);
                conversation_id = created.id;
            }
        }

        // convo auth + peer
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

        // insert message (safe cols)
        const { data: row, error: e3 } = await sb
            .from("messages")
            .insert([{ conversation_id, sender_id, body: msgBody }])
            .select("id,conversation_id,sender_id,body,created_at,read_at")
            .single();

        if (e3) throw new Error(e3.message);

        // update conversation updated_at (exists in your schema)
        await sb
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversation_id);

        return json(200, {
            ok: true,
            conversation_id,
            peer_id: peer,
            row: {
                id: row.id,
                conversation_id: row.conversation_id,
                from_id: row.sender_id,
                to_id: peer,
                text: row.body,
                created_at: row.created_at || new Date().toISOString(),
            },
        });
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
