// netlify/functions/sync_user.js
// ✅ Server-side: verifies Appwrite JWT, then upserts into Supabase with SERVICE_ROLE
// Requires ENV:
//   APPWRITE_ENDPOINT
//   APPWRITE_PROJECT_ID
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require("@supabase/supabase-js");
const authUser = require("./_auth_user");

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify(body),
    };
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

    try {
        const { userId } = await authUser(event);

        // Check existing by appwrite_user_id
        const existing = await supabase
            .from("users")
            .select("id")
            .eq("appwrite_user_id", userId)
            .maybeSingle();

        if (existing.error && existing.status !== 406) {
            return json(500, { ok: false, error: "Supabase select failed", detail: existing.error });
        }

        if (existing.data?.id) {
            return json(200, { ok: true, user_id: userId, created: false });
        }

        // Insert minimal row
        const ins = await supabase
            .from("users")
            .insert({ appwrite_user_id: userId })
            .select("id")
            .single();

        if (ins.error) {
            return json(500, { ok: false, error: "Supabase insert failed", detail: ins.error });
        }

        return json(200, { ok: true, user_id: userId, created: true, id: ins.data.id });
    } catch (e) {
        return json(401, { ok: false, error: e?.message || "Unauthorized" });
    }
};
