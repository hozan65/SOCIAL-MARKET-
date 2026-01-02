// netlify/functions/usage_check_and_inc.js
// Checks daily usage limits for free users and increments counters.
// Pro users bypass limits.
//
// ENV (optional):
// - FREE_DAILY_MSG_LIMIT (default 10)
// - FREE_DAILY_IMG_LIMIT (default 1)
//
// Requires Supabase tables:
// - profiles(id, plan, pro_active)
// - usage_daily(user_id, day, msg_count, img_count)
//
// Auth:
// - For now expects header "x-user-id" (replace with real auth later)

import { sbAdmin } from "./_supabase.js";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-user-id, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode, obj) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        body: JSON.stringify(obj),
    };
}

function todayISODateUTC() {
    // Use UTC date to avoid timezone edge issues on serverless
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`; // YYYY-MM-DD
}

function toInt(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        // TEMP AUTH (replace with Appwrite/Supabase auth verification)
        const userId = String(event.headers["x-user-id"] || "").trim();
        if (!userId) return json(401, { error: "Missing x-user-id (wire this to real auth)" });

        const body = JSON.parse(event.body || "{}");
        // type: "msg" | "img"
        const type = String(body.type || "").toLowerCase();
        if (type !== "msg" && type !== "img") {
            return json(400, { error: "Invalid type. Use: msg | img" });
        }

        const FREE_MSG_LIMIT = toInt(process.env.FREE_DAILY_MSG_LIMIT, 10);
        const FREE_IMG_LIMIT = toInt(process.env.FREE_DAILY_IMG_LIMIT, 1);

        const sb = sbAdmin();

        // 1) profile -> pro bypass
        const profRes = await sb
            .from("profiles")
            .select("plan, pro_active")
            .eq("id", userId)
            .maybeSingle();

        if (profRes.error) return json(500, { error: profRes.error.message });

        const plan = profRes.data?.plan || "free";
        const proActive = Boolean(profRes.data?.pro_active);

        if (proActive || plan.startsWith("pro")) {
            return json(200, {
                allowed: true,
                bypass: true,
                plan,
                remaining: { msg: null, img: null },
            });
        }

        // 2) Free -> check today's usage
        const day = todayISODateUTC();

        // Ensure row exists
        // (upsert with defaults)
        const upsertRes = await sb
            .from("usage_daily")
            .upsert(
                { user_id: userId, day },
                { onConflict: "user_id,day", ignoreDuplicates: true }
            );

        if (upsertRes.error) {
            // Not fatal if already exists, but log it
            console.error("usage_daily upsert error:", upsertRes.error);
        }

        const usageRes = await sb
            .from("usage_daily")
            .select("msg_count, img_count")
            .eq("user_id", userId)
            .eq("day", day)
            .single();

        if (usageRes.error) return json(500, { error: usageRes.error.message });

        let msgCount = toInt(usageRes.data?.msg_count, 0);
        let imgCount = toInt(usageRes.data?.img_count, 0);

        // 3) Decide allowed
        const wouldMsg = type === "msg" ? msgCount + 1 : msgCount;
        const wouldImg = type === "img" ? imgCount + 1 : imgCount;

        const msgAllowed = wouldMsg <= FREE_MSG_LIMIT;
        const imgAllowed = wouldImg <= FREE_IMG_LIMIT;

        const allowed = (type === "msg") ? msgAllowed : imgAllowed;

        if (!allowed) {
            return json(200, {
                allowed: false,
                plan: "free",
                limit: { msg: FREE_MSG_LIMIT, img: FREE_IMG_LIMIT },
                used: { msg: msgCount, img: imgCount },
                remaining: {
                    msg: Math.max(0, FREE_MSG_LIMIT - msgCount),
                    img: Math.max(0, FREE_IMG_LIMIT - imgCount),
                },
                reason: type === "msg" ? "msg_limit_reached" : "img_limit_reached",
            });
        }

        // 4) Increment counter atomically (best-effort)
        // Supabase supports "update + select" but atomic increment is easiest via RPC,
        // however we keep it simple with a guarded update:
        const updatePatch =
            type === "msg"
                ? { msg_count: msgCount + 1, updated_at: new Date().toISOString() }
                : { img_count: imgCount + 1, updated_at: new Date().toISOString() };

        const upd = await sb
            .from("usage_daily")
            .update(updatePatch)
            .eq("user_id", userId)
            .eq("day", day);

        if (upd.error) return json(500, { error: upd.error.message });

        // Return updated counts
        msgCount = type === "msg" ? msgCount + 1 : msgCount;
        imgCount = type === "img" ? imgCount + 1 : imgCount;

        return json(200, {
            allowed: true,
            plan: "free",
            limit: { msg: FREE_MSG_LIMIT, img: FREE_IMG_LIMIT },
            used: { msg: msgCount, img: imgCount },
            remaining: {
                msg: Math.max(0, FREE_MSG_LIMIT - msgCount),
                img: Math.max(0, FREE_IMG_LIMIT - imgCount),
            },
        });
    } catch (e) {
        console.error("usage_check_and_inc error:", e);
        return json(500, { error: e?.message || String(e) });
    }
};
