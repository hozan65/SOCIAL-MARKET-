import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = "avatars";

export const handler = async (event) => {
    try {
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const { user } = await getAppwriteUser(event);
        const uid = user.$id;

        // mevcut avatar url al
        const { data: prof } = await sb
            .from("profiles")
            .select("avatar_url")
            .eq("appwrite_user_id", uid)
            .maybeSingle();

        const avatarUrl = prof?.avatar_url || null;

        // DB null
        const { error: e1 } = await sb
            .from("profiles")
            .upsert(
                { appwrite_user_id: uid, avatar_url: null, updated_at: new Date().toISOString() },
                { onConflict: "appwrite_user_id" }
            );
        if (e1) return json(500, { error: e1.message });

        // storage silmeyi dene
        const path = tryExtractStoragePath(avatarUrl, BUCKET);
        if (path) await sb.storage.from(BUCKET).remove([path]).catch(()=>{});

        return json(200, { ok: true });
    } catch (e) {
        const msg = String(e?.message || e);
        const code = msg.includes("JWT") ? 401 : 500;
        return json(code, { error: msg });
    }
};

function tryExtractStoragePath(url, bucket) {
    if (!url) return null;
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
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT, x-jwt",
        },
        body: JSON.stringify(body),
    };
}
