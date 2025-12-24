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
            "Access-Control-Allow-Methods": "POST, OPTIONS",
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
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Missing Supabase env" });

        const jwt = getBearer(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        const user = await authUser(jwt);

        const body = JSON.parse(event.body || "{}");
        const following_id = String(body.following_id || "").trim();
        if (!following_id) return json(400, { error: "Missing following_id" });
        if (following_id === user.uid) return json(400, { error: "Cannot follow yourself" });

        const sb = createClient(SUPABASE_URL, SERVICE_KEY);

        const { data: existing, error: e1 } = await sb
            .from("follows")
            .select("id")
            .eq("follower_id", user.uid)
            .eq("following_id", following_id)
            .maybeSingle();

        if (e1) throw e1;

        if (existing?.id) {
            const { error: delErr } = await sb.from("follows").delete().eq("id", existing.id);
            if (delErr) throw delErr;
            return json(200, { ok: true, following: false });
        } else {
            const { error: insErr } = await sb
                .from("follows")
                .insert([{ follower_id: user.uid, following_id }]);
            if (insErr) throw insErr;
            return json(200, { ok: true, following: true });
        }
    } catch (e) {
        console.error("toggle_follow error:", e);
        return json(500, { error: e.message || "Server error" });
    }
};
