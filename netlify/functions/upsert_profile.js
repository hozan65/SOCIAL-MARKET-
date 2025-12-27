// netlify/functions/upsert_profile.js  (ESM)
import { authedUser } from "./_auth_user.js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const json = (statusCode, bodyObj) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(bodyObj),
});

const s = (v) => String(v ?? "").trim();

const cleanUrl = (v) => {
    const x = s(v);
    if (!x) return "";
    try {
        const u = new URL(x.startsWith("http") ? x : "https://" + x);
        return u.toString();
    } catch {
        return "";
    }
};

export async function handler(event) {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Missing Supabase env" });

        // ✅ auth
        const me = await authedUser(event); // { ok:true, user_id, email, name }
        if (!me?.ok) return json(401, { error: "Unauthorized" });

        const body = JSON.parse(event.body || "{}");

        // ✅ DB şeman: profiles(appwrite_user_id, name, bio, website, avatar_url, updated_at)
        const payload = {
            appwrite_user_id: me.user_id,
            name: s(body.name || me.name || "User"),
            bio: s(body.bio),
            website: cleanUrl(body.website),
            updated_at: new Date().toISOString(),
        };

        // ✅ upsert via REST (service role)
        const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${SERVICE_KEY}`,
                apikey: SERVICE_KEY,
                "Content-Type": "application/json",
                Prefer: "resolution=merge-duplicates",
            },
            body: JSON.stringify(payload),
        });

        const text = await res.text();
        if (!res.ok) return json(res.status, { error: text || "Supabase upsert failed" });

        return json(200, { ok: true });
    } catch (e) {
        console.error("upsert_profile error:", e);
        return json(500, { error: e?.message || "Server error" });
    }
}
