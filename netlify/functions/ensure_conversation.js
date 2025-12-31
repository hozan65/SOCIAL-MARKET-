// netlify/functions/ensure_conversation.js
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
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT, x-jwt",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
    body: JSON.stringify(body),
});

const sortPair = (a, b) =>
    String(a) < String(b) ? [String(a), String(b)] : [String(b), String(a)];

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        // ?to=OTHER_USER_ID
        const to = String(event.queryStringParameters?.to || "").trim();
        if (!to) return json(400, { error: "Missing 'to' param" });

        // 🔐 JWT doğrula
        const { user } = await getAppwriteUser(event);
        const me = user?.$id;
        if (!me) return json(401, { error: "Missing JWT" });
        if (to === me) return json(400, { error: "Cannot message yourself" });

        const [user1_id, user2_id] = sortPair(me, to);

        // 1) var mı?
        const { data: existing, error: e1 } = await supabase
            .from("conversations")
            .select("id,user1_id,user2_id,created_at")
            .eq("user1_id", user1_id)
            .eq("user2_id", user2_id)
            .maybeSingle();

        if (e1) return json(500, { error: e1.message });

        if (existing?.id) {
            return json(200, { ok: true, conversation_id: existing.id });
        }

        // 2) yoksa oluştur
        const { data: created, error: e2 } = await supabase
            .from("conversations")
            .insert({ user1_id, user2_id })
            .select("id")
            .single();

        if (!e2 && created?.id) {
            return json(200, { ok: true, conversation_id: created.id });
        }

        // 3) race condition (aynı anda iki create) -> tekrar çek
        const { data: again, error: e3 } = await supabase
            .from("conversations")
            .select("id")
            .eq("user1_id", user1_id)
            .eq("user2_id", user2_id)
            .maybeSingle();

        if (e3) return json(500, { error: e3.message });
        if (!again?.id) return json(500, { error: e2?.message || "ensure_conversation failed" });

        return json(200, { ok: true, conversation_id: again.id });
    } catch (e) {
        const msg = String(e?.message || e);
        const status = msg.toLowerCase().includes("jwt") ? 401 : 500;
        return json(status, { error: msg });
    }
};
