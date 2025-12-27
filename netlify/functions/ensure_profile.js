// netlify/functions/ensure_profile.js
import { createClient } from "@supabase/supabase-js";
import * as AUTH from "./_auth_user.js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async (event) => {
    try {
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        // ✅ JWT doğrula (projendeki helper üzerinden)
        const user = await requireUser(event);
        const uid = user?.id || user?.uid || user?.$id || user?.appwrite_user_id;
        const name = user?.name || "";

        if (!uid) return json(401, { error: "Missing JWT" });

        // Row var mı?
        const { data: existing, error: e1 } = await sb
            .from("profiles")
            .select("appwrite_user_id")
            .eq("appwrite_user_id", uid)
            .maybeSingle();

        if (e1) return json(500, { error: e1.message });

        // Yoksa oluştur
        if (!existing) {
            const { error: e2 } = await sb.from("profiles").insert({
                appwrite_user_id: uid,
                name: name || null,
                bio: null,
                website: null,
                avatar_url: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });

            if (e2) return json(500, { error: e2.message });
        }

        return json(200, { ok: true });
    } catch (e) {
        const msg = String(e?.message || e);
        // helper hata mesajları bazen "Missing JWT" gibi gelir
        const status = msg.toLowerCase().includes("jwt") ? 401 : 500;
        return json(status, { error: msg });
    }
};

async function requireUser(event) {
    // Projende _auth_user.js içinde hangi isimle export varsa otomatik yakala
    const fn =
        AUTH.requireUser ||
        AUTH.getUser ||
        AUTH.authUser ||
        AUTH.getAuthUser ||
        AUTH.default;

    if (!fn) throw new Error("Auth helper not found in _auth_user.js");

    const u = await fn(event);
    if (!u) throw new Error("Missing JWT");
    return u;
}

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify(body),
    };
}
