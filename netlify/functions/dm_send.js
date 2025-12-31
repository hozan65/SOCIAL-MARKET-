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

        // conversation_id yoksa otomatik conversation bul/oluştur
        if (!conversation_id) {
            const a = from_id, b = to_id;

            const { data: existing, error: e1 } = await sb
                .from("conversations")
                .select("id,user_a,user_b")
                .or(`and(user_a.eq.${a},user_b.eq.${b}),and(user_a.eq.${b},user_b.eq.${a})`)
                .limit(1);

            if (e1) throw new Error(e1.message);

            if (existing && existing[0]) {
                conversation_id = existing[0].id;
            } else {
                const { data: created, error: e2 } = await sb
                    .from("conversations")
                    .insert([{ user_a: a, user_b: b, last_message: "", last_at: new Date().toISOString() }])
                    .select("id")
                    .single();

                if (e2) throw new Error(e2.message);
                conversation_id = created.id;
            }
        }

        // message insert
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

        // conversation preview update
        await sb
            .from("conversations")
            .update({ last_message: String(text).slice(0, 140), last_at: new Date().toISOString() })
            .eq("id", conversation_id);

        return json(200, { ok: true, conversation_id, row });
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
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
