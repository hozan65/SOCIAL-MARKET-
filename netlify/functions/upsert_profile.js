// netlify/functions/profile_upsert.js (örnek isim)
// ESM (Netlify new runtime ile uyumlu)

import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

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

function getServiceKey() {
    return (
        (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim() ||
        (process.env.SUPABASE_SERVICE_ROLE || "").trim()
    );
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
        const SERVICE_KEY = getServiceKey();

        if (!SUPABASE_URL || !SERVICE_KEY) {
            return json(500, { error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
        }

        const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        const { user } = await getAppwriteUser(event);
        const uid = user.$id;

        const body = JSON.parse(event.body || "{}");

        const payload = {
            appwrite_user_id: uid,
            name: user.name || "",
            bio: body.bio ? String(body.bio).slice(0, 500) : null,
            website: body.website ? String(body.website).slice(0, 300) : null,
            updated_at: new Date().toISOString(),
        };

        const { error } = await sb.from("profiles").upsert(payload, {
            onConflict: "appwrite_user_id",
        });

        if (error) return json(500, { error: error.message });

        return json(200, { ok: true });
    } catch (e) {
        const msg = String(e?.message || e);
        return json(msg.toLowerCase().includes("jwt") ? 401 : 500, { error: msg });
    }
};
