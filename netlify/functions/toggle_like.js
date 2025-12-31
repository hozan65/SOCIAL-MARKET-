// netlify/functions/toggle_like.js
import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Socket emit endpoint (VPS'deki socket server)
// ör: https://socket.chriontoken.com/emit/like
const SOCKET_EMIT_URL = process.env.SOCKET_EMIT_URL || "";
const SOCKET_SECRET = process.env.SOCKET_SECRET || "";

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        // ✅ JWT -> Appwrite user
        const { user } = await getAppwriteUser(event);
        const uid = user.$id;

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

        const post_id = String(body.post_id || "").trim();
        if (!post_id) return json(400, { error: "Missing post_id" });

        // ✅ check existing like
        const { data: existing, error: e1 } = await sb
            .from("post_likes")
            .select("id")
            .eq("post_id", post_id)
            .eq("user_id", uid)
            .maybeSingle();

        if (e1) return json(500, { error: e1.message });

        let liked = false;
        let action = "";

        // ✅ toggle
        if (existing?.id) {
            const { error: delErr } = await sb.from("post_likes").delete().eq("id", existing.id);
            if (delErr) return json(500, { error: delErr.message });
            liked = false;
            action = "unlike";
        } else {
            const { error: insErr } = await sb
                .from("post_likes")
                .insert([{ post_id, user_id: uid }]);

            if (insErr) return json(500, { error: insErr.message });
            liked = true;
            action = "like";
        }

        // ✅ total likes count for this post
        const { count, error: cErr } = await sb
            .from("post_likes")
            .select("*", { count: "exact", head: true })
            .eq("post_id", post_id);

        if (cErr) return json(500, { error: cErr.message });

        const likes_count = Number(count || 0);

        // ✅ fire-and-forget socket broadcast (fail olsa bile like işlemi başarılı kalsın)
        emitLikeUpdateSafe({
            post_id,
            likes_count,
            user_id: uid,
            action
        });

        return json(200, { ok: true, liked, likes_count });
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
            "Access-Control-Allow-Methods": "POST, OPTIONS"
        },
        body: JSON.stringify(body),
    };
}

// Netlify function response'u bekletmeden socket'e haber ver
async function emitLikeUpdateSafe(payload) {
    try {
        if (!SOCKET_EMIT_URL) return;

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 1500);

        await fetch(SOCKET_EMIT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-socket-secret": SOCKET_SECRET
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(t);
    } catch {
        // sessiz geç: DB yazımı başarılıysa kullanıcıyı bozma
    }
}
