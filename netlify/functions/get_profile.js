// netlify/functions/get_profile.js
const { createClient } = require("@supabase/supabase-js");
const { authUser } = require("./_auth_user");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

function json(statusCode, bodyObj) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify(bodyObj),
    };
}

function getBearer(event) {
    const h = event.headers.authorization || event.headers.Authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Missing Supabase env" });

        const jwt = getBearer(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        // ✅ auth check (even if you fetch other uid)
        await authUser(jwt);

        const uid = (event.queryStringParameters?.uid || "").trim();
        if (!uid) return json(400, { error: "Missing uid" });

        const sb = createClient(SUPABASE_URL, SERVICE_KEY);

        // ✅ x YOK
        const { data, error } = await sb
            .from("profiles")
            .select("appwrite_user_id,name,bio,website,avatar_url,created_at,updated_at")
            .eq("appwrite_user_id", uid)
            .maybeSingle();

        if (error) throw error;

        return json(200, { ok: true, profile: data || null });
    } catch (e) {
        console.error("get_profile error:", e);
        return json(500, { error: e?.message || "Server error" });
    }
};
