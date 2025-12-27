// netlify/functions/delete_avatar.js
import { createClient } from "@supabase/supabase-js";
import * as AUTH from "./_auth_user.js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = "avatars"; // senin bucket adın bu olmalı

export const handler = async (event) => {
    try {
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const user = await requireUser(event);
        const uid = user?.id || user?.uid || user?.$id || user?.appwrite_user_id;
        if (!uid) return json(401, { error: "Missing JWT" });

        // Mevcut avatar_url al (storage silmeye çalışacağız)
        const { data: prof, error: pe } = await sb
            .from("profiles")
            .select("avatar_url")
            .eq("appwrite_user_id", uid)
            .maybeSingle();

        if (pe) return json(500, { error: pe.message });

        const avatarUrl = prof?.avatar_url || null;

        // ✅ DB: avatar_url null
        const { error: ue } = await sb
            .from("profiles")
            .upsert(
                { appwrite_user_id: uid, avatar_url: null, updated_at: new Date().toISOString() },
                { onConflict: "appwrite_user_id" }
            );

        if (ue) return json(500, { error: ue.message });

        // ✅ Storage silmeyi dene (başarısız olsa da DB temizlendiği için sorun yok)
        if (avatarUrl) {
            const path = tryExtractStoragePath(avatarUrl, BUCKET);
            if (path) {
                await sb.storage.from(BUCKET).remove([path]).catch(() => {});
            }
        }

        return json(200, { ok: true });
    } catch (e) {
        const msg = String(e?.message || e);
        const status = msg.toLowerCase().includes("jwt") ? 401 : 500;
        return json(status, { error: msg });
    }
};

async function requireUser(event) {
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

function tryExtractStoragePath(url, bucket) {
    // Supabase public url genelde:
    // https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<path>
    try {
        const u = new URL(url);
        const marker = `/storage/v1/object/public/${bucket}/`;
        const idx = u.pathname.indexOf(marker);
        if (idx === -1) return null;
        return decodeURIComponent(u.pathname.slice(idx + marker.length));
    } catch {
        return null;
    }
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
