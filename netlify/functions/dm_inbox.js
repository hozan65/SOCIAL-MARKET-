// netlify/functions/dm_inbox.js
import { getAppwriteUser } from "./_appwrite_user.js";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        const { user } = await getAppwriteUser(event);
        const uid = user.$id;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
            throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env");
        }

        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        const { data, error } = await sb
            .from("conversations")
            .select("id,user_a,user_b,last_message,last_at")
            .or(`user_a.eq.${uid},user_b.eq.${uid}`)
            .order("last_at", { ascending: false, nullsFirst: false });

        if (error) throw new Error(error.message);

        const list = (data || []).map((c) => ({
            conversation_id: c.id,
            peer_id: c.user_a === uid ? c.user_b : c.user_a,
            last_message: c.last_message || "",
            last_at: c.last_at || null,
        }));

        return json(200, { ok: true, list });
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
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
